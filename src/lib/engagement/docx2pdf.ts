import "server-only";
import { rgb } from "pdf-lib";
import {
  JSZIP_MIN_B64, DOCX_PREVIEW_MIN_B64,
  TINOS_400_B64, TINOS_700_B64, TINOS_400I_B64, TINOS_700I_B64,
} from "./docx2pdf-vendor";

/**
 * Print a .docx to PDF exactly the way Word would: the document is rendered
 * page-for-page by docx-preview (headers, footers, tabs, tables, numbering,
 * bold/underline/strike runs) inside headless Chromium, then printed. This is
 * the letter the client sees — same layout as the attorney's Word file, not a
 * re-typeset copy.
 *
 * Chromium: on Vercel it comes from @sparticuz/chromium; anywhere else set
 * CHROMIUM_PATH (the local rig uses the preinstalled Playwright build).
 * Tinos (metrically identical to Times New Roman) is embedded so the letter
 * lays out the same on every machine. The vendor file is regenerated with:
 *   node -e '…base64 node_modules bundles…'  (see docx2pdf-vendor.ts)
 */

const PAGE_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; }
  @font-face { font-family: "Times New Roman"; font-weight: 400; font-style: normal; src: url(data:font/woff2;base64,${TINOS_400_B64}) format("woff2"); }
  @font-face { font-family: "Times New Roman"; font-weight: 700; font-style: normal; src: url(data:font/woff2;base64,${TINOS_700_B64}) format("woff2"); }
  @font-face { font-family: "Times New Roman"; font-weight: 400; font-style: italic; src: url(data:font/woff2;base64,${TINOS_400I_B64}) format("woff2"); }
  @font-face { font-family: "Times New Roman"; font-weight: 700; font-style: italic; src: url(data:font/woff2;base64,${TINOS_700I_B64}) format("woff2"); }
  /* docx-preview draws each Word page as a fixed-size sheet; strip its screen
     chrome so each sheet becomes one printed page. */
  .docx-wrapper { background: none !important; padding: 0 !important; margin: 0 !important; display: block !important; }
  .docx-wrapper > section.docx { box-shadow: none !important; margin: 0 !important; break-after: page; }
  .docx-wrapper > section.docx:last-child { break-after: auto; }
`;

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  if (process.env.CHROMIUM_PATH) {
    return puppeteer.launch({
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    });
  }
  // @sparticuz/chromium decides whether to unpack its shared libraries
  // (libnss3 & co.) by sniffing AWS env markers, and on Vercel that sniffing
  // fails — the browser binary lands in /tmp with nothing it links against
  // ("cannot open shared object file"). Its detection is not trusted here at
  // all: the library pack's presence is VERIFIED on disk, extracted directly
  // from the package when absent, and the library path is handed to the
  // browser process explicitly.
  process.env["AWS_LAMBDA_JS_RUNTIME"] = "nodejs22.x";
  const { existsSync, rmSync } = await import("node:fs");
  const LIBNSS = "/tmp/al2023/lib/libnss3.so";
  if (existsSync("/tmp/chromium") && !existsSync(LIBNSS)) {
    // A half-extracted sandbox: drop the binary so extraction runs fresh.
    try { rmSync("/tmp/chromium", { force: true }); } catch { /* re-extract below */ }
  }
  const mod = await import("@sparticuz/chromium");
  const chromium = (mod.default ?? mod) as typeof mod.default;
  const executablePath = await chromium.executablePath();
  if (!existsSync(LIBNSS)) {
    // Their detection skipped the libraries again — unpack them ourselves,
    // straight from the package's bin folder.
    const { createRequire } = await import("node:module");
    const { dirname, join } = await import("node:path");
    const req = createRequire(join(process.cwd(), "package.json"));
    const binDir = join(dirname(req.resolve("@sparticuz/chromium/package.json")), "bin");
    const lfsMod = await import("@sparticuz/chromium/build/lambdafs.js") as unknown as { default?: { inflate(p: string): Promise<string> }; inflate?(p: string): Promise<string> };
    const lfs = lfsMod.default ?? lfsMod;
    await (lfs as { inflate(p: string): Promise<string> }).inflate(join(binDir, "al2023.tar.br"));
    if (!existsSync("/tmp/fonts")) await (lfs as { inflate(p: string): Promise<string> }).inflate(join(binDir, "fonts.tar.br")).catch(() => undefined);
  }
  const libPath = ["/tmp/al2023/lib", process.env["LD_LIBRARY_PATH"]].filter(Boolean).join(":");
  process.env["LD_LIBRARY_PATH"] = libPath;
  process.env["FONTCONFIG_PATH"] ??= "/tmp/fonts";
  try {
    return await puppeteer.launch({
      executablePath,
      headless: chromium.headless as "shell", // the sparticuz build is headless_shell
      args: [...chromium.args, "--font-render-hinting=none"],
      defaultViewport: chromium.defaultViewport,
      env: { ...process.env, LD_LIBRARY_PATH: libPath, FONTCONFIG_PATH: process.env["FONTCONFIG_PATH"]! },
    });
  } catch (err) {
    // If it still fails, the error must say exactly what the sandbox looks
    // like — no more blind rounds.
    const diag = [
      `bin=${existsSync("/tmp/chromium")}`,
      `libnss3=${existsSync(LIBNSS)}`,
      `fonts=${existsSync("/tmp/fonts")}`,
      `LD=${libPath}`,
      `execEnv=${process.env["AWS_EXECUTION_ENV"] ?? "(unset)"}`,
    ].join(" ");
    throw new Error(`${(err as Error).message} [diag: ${diag}]`, { cause: err });
  }
}

/* ------------------- headers & footers, the Word way ------------------- *
 * docx-preview lays a section's header/footer out once per SECTION, not once
 * per printed page — so a flowing letter got its letterhead footer at the end
 * of the document instead of on every page. The fix keeps fidelity absolute:
 * each header/footer part is itself rendered by docx-preview (same styles,
 * same images, same fonts, from the SAME template file), screenshotted, and
 * stamped onto every printed page at Word's own header/footer distances.
 * "Page X of Y" fields are filled with the real numbers per page.           */

type SectionInfo = {
  pgW: number; pgH: number; // twips
  marL: number; marR: number;
  headerDist: number; footerDist: number;
  titlePg: boolean;
  refs: Partial<Record<"headerFirst" | "headerDefault" | "footerFirst" | "footerDefault", string>>; // part path in zip
};

const TW = (v: string | undefined, d: number) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : d;
};

async function analyzeSection(zip: JSZipNS): Promise<SectionInfo> {
  const doc = await zip.file("word/document.xml")!.async("string");
  const sect = doc.slice(doc.lastIndexOf("<w:sectPr"));
  const attr = (tag: string, a: string) => sect.match(new RegExp(`<w:${tag}[^>]*w:${a}="([^"]+)"`))?.[1];
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const relMap = new Map([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2].replace(/^\/?(word\/)?/, "word/")]));
  const refs: SectionInfo["refs"] = {};
  for (const m of sect.matchAll(/<w:(header|footer)Reference[^>]*r:id="([^"]+)"[^>]*w:type="(\w+)"/g)) {
    const target = relMap.get(m[2]);
    if (!target) continue;
    if (m[3] === "first") refs[m[1] === "header" ? "headerFirst" : "footerFirst"] = target;
    if (m[3] === "default") refs[m[1] === "header" ? "headerDefault" : "footerDefault"] = target;
  }
  return {
    pgW: TW(attr("pgSz", "w"), 12240), pgH: TW(attr("pgSz", "h"), 15840),
    marL: TW(attr("pgMar", "left"), 1440), marR: TW(attr("pgMar", "right"), 1440),
    headerDist: TW(attr("pgMar", "header"), 720), footerDist: TW(attr("pgMar", "footer"), 720),
    titlePg: /<w:titlePg(?:\s|\/)/.test(sect),
    refs,
  };
}

type JSZipNS = Awaited<ReturnType<(typeof import("jszip"))["loadAsync"]>>;

/** Turn one header/footer part into a standalone mini-docx that renders JUST
 *  that part — same styles, media, and relationships as the original. */
async function buildPartDocx(zip: JSZipNS, partPath: string, pageNo?: number, pageCount?: number): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const original = await zip.file("word/document.xml")!.async("string");
  const rootTag = original.slice(original.indexOf("<w:document"), original.indexOf(">", original.indexOf("<w:document")) + 1);
  let part = await zip.file(partPath)!.async("string");
  // Fill PAGE / NUMPAGES fields with literal numbers (docx-preview can't):
  // each instrText becomes a literal text run in place, and the field-char
  // markers drop away — works whatever run shape the field arrived in.
  if (pageNo !== undefined) {
    part = part
      .replace(/<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/g, (_m, instr: string) => {
        const value = /NUMPAGES/.test(instr) ? String(pageCount ?? pageNo) : /PAGE/.test(instr) ? String(pageNo) : "";
        return `<w:t xml:space="preserve">${value}</w:t>`;
      })
      .replace(/<w:fldChar[^>]*\/>/g, "");
  }
  const inner = part.slice(part.indexOf(">", part.indexOf("<w:hdr") >= 0 ? part.indexOf("<w:hdr") : part.indexOf("<w:ftr")) + 1, Math.max(part.lastIndexOf("</w:hdr>"), part.lastIndexOf("</w:ftr>")));
  const sect = (await zip.file("word/document.xml")!.async("string")).slice(original.lastIndexOf("<w:sectPr"));
  const pgSz = sect.match(/<w:pgSz[^>]*\/>/)?.[0] ?? `<w:pgSz w:w="12240" w:h="15840"/>`;
  const pgMar = sect.match(/<w:pgMar[^>]*\/>/)?.[0]?.replace(/w:top="[^"]*"/, 'w:top="0"').replace(/w:bottom="[^"]*"/, 'w:bottom="0"') ?? "";
  const out = new JSZip();
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir || name === "word/document.xml" || name === "word/_rels/document.xml.rels") continue;
    out.file(name, await file.async("uint8array"));
  }
  out.file("word/document.xml", `${original.slice(0, original.indexOf("<w:document"))}${rootTag}<w:body>${inner}<w:sectPr>${pgSz}${pgMar}</w:sectPr></w:body></w:document>`);
  const partRels = await zip.file(`word/_rels/${partPath.split("/").pop()}.rels`)?.async("string");
  out.file("word/_rels/document.xml.rels", partRels ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  return Buffer.from(await out.generateAsync({ type: "uint8array" }));
}

export async function docxToPdf(docx: Buffer, opts: { footerInitials?: string } = {}): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(docx);
  const sec = await analyzeSection(zip);
  const pageWpt = sec.pgW / 20 || 612;
  const pageHpt = sec.pgH / 20 || 792;
  const pageWpx = Math.round(pageWpt / 0.75);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: pageWpx + 200, height: 1400, deviceScaleFactor: 2 });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}
      /* Body print: horizontal margins come from the section, vertical ones
         from @page so EVERY page gets them, not just the first. */
      #out .docx-wrapper > section.docx { padding-top: 0 !important; padding-bottom: 0 !important; min-height: 0 !important; height: auto !important; }
      /* Part capture: an opaque page-width band, nothing bleeding through. */
      #part { position: absolute; left: 0; top: 0; width: ${pageWpx}px; overflow: hidden; background: #fff; }
      #part .docx-wrapper { background: #fff !important; padding: 0 !important; margin: 0 !important; }
      #part section.docx { background: #fff !important; box-shadow: none !important; margin: 0 !important; min-height: 0 !important; height: auto !important; padding-top: 0 !important; padding-bottom: 0 !important; }
      /* Letterhead tables (the offices footer) center on the page, as drafted. */
      #part section.docx table { margin-left: auto !important; margin-right: auto !important; }
      @media print { #part { display: none !important; } }
    </style><style id="pg"></style></head>
<body><div id="out"></div><div id="part"></div>
<script src="data:text/javascript;base64,${JSZIP_MIN_B64}"></script>
<script src="data:text/javascript;base64,${DOCX_PREVIEW_MIN_B64}"></script>
</body></html>`;
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });

    const render = async (b64: string, target: "out" | "part") => {
      await page.evaluate(async (data: string, id: string) => {
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const el = document.getElementById(id)!;
        el.innerHTML = "";
        // @ts-expect-error docx-preview attaches itself as window.docx
        await window.docx.renderAsync(bytes.buffer, el, undefined, {
          inWrapper: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: false,
          renderFooters: false,
          renderFootnotes: true,
        });
        await (document as Document & { fonts: FontFaceSet }).fonts.ready;
      }, b64, target);
    };

    type Shot = { png: Buffer; cssW: number; cssH: number; initialsAt?: { x: number; y: number; h: number } };
    /** Render one letterhead part to an opaque page-width PNG strip. The
     *  letter itself is hidden while shooting so nothing shows through. */
    const shoot = async (partPath: string, pageNo: number, pageCount?: number): Promise<Shot | null> => {
      try {
        const bytes = await buildPartDocx(zip, partPath, pageNo, pageCount);
        await page.evaluate(() => { (document.getElementById("out") as HTMLElement).style.display = "none"; });
        await render(bytes.toString("base64"), "part");
        const m = await page.evaluate(() => {
          const el = document.querySelector("#part section.docx") as HTMLElement | null;
          if (!el) return null;
          const h = el.getBoundingClientRect().height;
          // Where does a "Client Initials:" label end inside this strip? The
          // initials get typed right after it on every page.
          let initialsAt: { x: number; y: number; h: number } | null = null;
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const t = node.textContent ?? "";
            const m = t.match(/initials\s*:?/i);
            if (m && m.index !== undefined) {
              const range = document.createRange();
              range.setStart(node, m.index);
              range.setEnd(node, m.index + m[0].length);
              const r = range.getBoundingClientRect();
              initialsAt = { x: r.right, y: r.top, h: r.height };
              break;
            }
          }
          // Some letterhead tables draw a touch wider than the page; capture
          // the real width so the stamp can scale-to-fit instead of clipping.
          const w = Math.max(el.getBoundingClientRect().width, el.scrollWidth);
          return { h, w, initialsAt };
        });
        if (!m || m.h < 2) return null;
        const clipW = Math.min(Math.max(m.w, pageWpx), pageWpx + 190);
        const png = await page.screenshot({ clip: { x: 0, y: 0, width: clipW, height: m.h } });
        return { png: Buffer.from(png), cssW: clipW, cssH: m.h, initialsAt: m.initialsAt ?? undefined };
      } catch (err) {
        console.error(`[docx2pdf] letterhead part ${partPath} failed to render:`, err);
        return null;
      } finally {
        await page.evaluate(() => {
          (document.getElementById("part") as HTMLElement).innerHTML = "";
          (document.getElementById("out") as HTMLElement).style.display = "";
        }).catch(() => undefined);
      }
    };

    // 1) Measure the letterhead parts FIRST — the body's per-page margins
    //    must clear them so no contract text ever hides behind a stamp.
    const h1Path = sec.titlePg ? (sec.refs.headerFirst ?? sec.refs.headerDefault) : sec.refs.headerDefault;
    const f1Path = sec.titlePg ? (sec.refs.footerFirst ?? sec.refs.footerDefault) : sec.refs.footerDefault;
    const h1Shot = h1Path ? await shoot(h1Path, 1) : null;
    const f1Shot = f1Path ? await shoot(f1Path, 1) : null;
    const hDefProbe = sec.refs.headerDefault ? await shoot(sec.refs.headerDefault, 2) : null;
    const fDefProbe = sec.refs.footerDefault ? await shoot(sec.refs.footerDefault, 2) : null;

    const marTop = 1440 / 20; // Word top/bottom margins (the template uses 1")
    const marBot = 1440 / 20;
    const band = (dist: number, shotH: number | undefined, base: number) =>
      Math.max(base, shotH ? dist / 20 + shotH * 0.75 + 4 : 0);
    const topFirst = band(sec.headerDist, h1Shot?.cssH, marTop);
    const botFirst = band(sec.footerDist, f1Shot?.cssH, marBot);
    const topDef = band(sec.headerDist, hDefProbe?.cssH, marTop);
    const botDef = band(sec.footerDist, fDefProbe?.cssH, marBot);
    await page.evaluate((css: string) => { document.getElementById("pg")!.textContent = css; },
      `@page { size: ${pageWpt}pt ${pageHpt}pt; margin: ${topDef}pt 0 ${botDef}pt 0; }
       @page :first { margin-top: ${topFirst}pt; margin-bottom: ${botFirst}pt; }`);

    // 2) Print the letter body with those margins on EVERY page.
    await render(docx.toString("base64"), "out");
    const bodyPdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, timeout: 60_000 });

    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bodyPdf);
    const pageCount = pdf.getPageCount();

    const italic = opts.footerInitials ? await pdf.embedFont((await import("pdf-lib")).StandardFonts.TimesRomanItalic) : null;
    const stamp = async (pageIdx: number, shotP: Shot | null, at: "top" | "bottom") => {
      if (!shotP) return;
      const img = await pdf.embedPng(shotP.png);
      // Scale-to-fit: a strip wider than the page shrinks (a few percent at
      // most) and centers, so nothing gets cut at the paper edge.
      const scale = Math.min(1, pageWpt / (shotP.cssW * 0.75));
      const w = shotP.cssW * 0.75 * scale;
      const h = shotP.cssH * 0.75 * scale;
      const x = (pageWpt - w) / 2;
      const y = at === "top" ? pageHpt - sec.headerDist / 20 - h : sec.footerDist / 20;
      const pg = pdf.getPage(pageIdx);
      pg.drawImage(img, { x, y, width: w, height: h });
      // The signed letter carries the client's initials in every footer blank.
      if (opts.footerInitials && italic && shotP.initialsAt) {
        const ix = x + (shotP.initialsAt.x * 0.75 + 6) * scale;
        const iy = y + h - (shotP.initialsAt.y + shotP.initialsAt.h) * 0.75 * scale + 2;
        pg.drawText(opts.footerInitials, { x: ix, y: iy, size: 11 * scale, font: italic, color: rgb(0.1, 0.1, 0.12) });
      }
    };

    // 3) Page one gets the first-page letterhead; later pages the default
    //    header/footer, re-rendered per page when they carry page numbers.
    const hasFields = async (p?: string) => (p ? /fldChar/.test(await zip.file(p)!.async("string")) : false);
    const hDefFields = await hasFields(sec.refs.headerDefault);
    const fDefFields = await hasFields(sec.refs.footerDefault);
    await stamp(0, h1Shot ? (await hasFields(h1Path)) ? await shoot(h1Path!, 1, pageCount) : h1Shot : null, "top");
    await stamp(0, f1Shot ? (await hasFields(f1Path)) ? await shoot(f1Path!, 1, pageCount) : f1Shot : null, "bottom");
    for (let i = 1; i < pageCount; i++) {
      if (sec.refs.headerDefault) await stamp(i, hDefFields ? await shoot(sec.refs.headerDefault, i + 1, pageCount) : hDefProbe, "top");
      if (sec.refs.footerDefault) await stamp(i, fDefFields ? await shoot(sec.refs.footerDefault, i + 1, pageCount) : fDefProbe, "bottom");
    }

    return Buffer.from(await pdf.save());
  } finally {
    await browser.close().catch(() => undefined);
  }
}
