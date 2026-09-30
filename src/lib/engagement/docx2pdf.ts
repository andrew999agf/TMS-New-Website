import "server-only";
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

export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head>
<body><div id="out"></div>
<script src="data:text/javascript;base64,${JSZIP_MIN_B64}"></script>
<script src="data:text/javascript;base64,${DOCX_PREVIEW_MIN_B64}"></script>
</body></html>`;
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(async (b64: string) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      // @ts-expect-error docx-preview attaches itself as window.docx
      await window.docx.renderAsync(bytes.buffer, document.getElementById("out"), undefined, {
        inWrapper: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
      });
      await (document as Document & { fonts: FontFaceSet }).fonts.ready;
    }, docx.toString("base64"));
    // The Word page carries its own size + margins; print at CSS-decided size.
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: false,
      format: "letter",
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 60_000,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
