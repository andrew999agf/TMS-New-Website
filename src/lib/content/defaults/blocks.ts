/**
 * Default content blocks. Every user-visible string on the public site is a
 * block addressed by a stable key (e.g. "home.hero.headline"). The content
 * layer returns the DB value when present, else these defaults — so there is
 * no hard-coded copy in components, and the site still renders before seeding.
 */
import { FIRM, QUOTES } from "@/lib/firm";

export type BlockType = "text" | "richtext" | "image" | "video" | "number" | "url" | "json";

export type BlockSeed = {
  key: string;
  page: string;
  section: string;
  label: string;
  type: BlockType;
  value: string;
  sort?: number;
};

export const CONTENT_BLOCKS: BlockSeed[] = [
  // ---- Global ----
  { key: "global.firmName", page: "global", section: "brand", label: "Firm name", type: "text", value: FIRM.name },
  { key: "global.firmShort", page: "global", section: "brand", label: "Firm short name", type: "text", value: FIRM.shortName },
  { key: "global.tagline", page: "global", section: "brand", label: "Tagline", type: "text", value: "Generally trained for your specific legal matter." },
  { key: "global.logoDark", page: "global", section: "logo", label: "Logo (your main logo — shown white automatically on dark areas like the footer)", type: "image", value: "" },
  { key: "global.logoLight", page: "global", section: "logo", label: "Logo — white/light version (optional; only needed if you don't want the auto-white)", type: "image", value: "" },
  { key: "global.socialImage", page: "global", section: "logo", label: "Social share image (shown when pages are texted or posted to social media — 1200×630px)", type: "image", value: "" },
  { key: "global.favicon", page: "global", section: "logo", label: "Favicon (browser tab icon — square PNG, 512×512px)", type: "image", value: "" },

  // ---- Global: Social media links (icons in the footer) ----
  { key: "global.social.facebook", page: "global", section: "social", label: "Facebook URL", type: "url", value: "" },
  { key: "global.social.instagram", page: "global", section: "social", label: "Instagram URL", type: "url", value: "" },
  { key: "global.social.linkedin", page: "global", section: "social", label: "LinkedIn URL", type: "url", value: "" },
  { key: "global.social.x", page: "global", section: "social", label: "X (Twitter) URL", type: "url", value: "" },
  { key: "global.social.youtube", page: "global", section: "social", label: "YouTube URL", type: "url", value: "" },
  { key: "global.social.tiktok", page: "global", section: "social", label: "TikTok URL", type: "url", value: "" },

  // ---- Home: Hero ----
  { key: "home.hero.eyebrow", page: "home", section: "hero", label: "Hero eyebrow", type: "text", value: "T. Maxwell Smith, PLLC | Bosque County | Fort Worth | Weatherford" },
  { key: "home.hero.headline", page: "home", section: "hero", label: "Hero headline", type: "text", value: "Generally trained for your specific legal matter." },
  { key: "home.hero.support", page: "home", section: "hero", label: "Hero support line", type: "text", value: "The law is a seamless web — one matter bleeds into the next. A trial firm with a general practice, ready for whatever your case touches." },
  { key: "home.hero.ctaLabel", page: "home", section: "hero", label: "Hero button label", type: "text", value: "Request a Consultation" },
  { key: "home.hero.ctaHref", page: "home", section: "hero", label: "Hero button link", type: "url", value: "/consultation" },
  { key: "home.hero.cta2Label", page: "home", section: "hero", label: "Hero secondary label", type: "text", value: "See the Record" },
  { key: "home.hero.cta2Href", page: "home", section: "hero", label: "Hero secondary link", type: "url", value: "/results" },

  // ---- Home: Firm strip ----
  { key: "home.firm.eyebrow", page: "home", section: "firmStrip", label: "Eyebrow", type: "text", value: "The Firm" },
  { key: "home.firm.heading", page: "home", section: "firmStrip", label: "Heading", type: "text", value: "A trial firm with a general practice." },
  { key: "home.firm.body", page: "home", section: "firmStrip", label: "Body", type: "richtext", value: "<p>Nobody ever wants to need a lawyer. When you do, you want one who gets you the answers you need — not one who passes the buck.</p><p>The law is a seamless web: a business matter can turn on family, probate, criminal, or tort law without warning, and an issue in one area often calls for counsel in another. We practice across the whole of Texas law so your representation is comprehensive — and we bring a born Texan's mindset of no retreat, no surrender to every matter.</p>" },

  // ---- Home: Results band ----
  { key: "home.results.eyebrow", page: "home", section: "resultsBand", label: "Eyebrow", type: "text", value: "The Record" },
  { key: "home.results.heading", page: "home", section: "resultsBand", label: "Heading", type: "text", value: "We don't say much. The record talks." },
  { key: "home.results.ctaLabel", page: "home", section: "resultsBand", label: "Button label", type: "text", value: "All results" },

  // ---- Home: Practice areas band ----
  { key: "home.practice.eyebrow", page: "home", section: "practiceBand", label: "Eyebrow", type: "text", value: "Practice Areas" },
  { key: "home.practice.heading", page: "home", section: "practiceBand", label: "Heading", type: "text", value: "What we handle." },
  { key: "home.practice.body", page: "home", section: "practiceBand", label: "Body", type: "text", value: "A full range of practice areas, one discipline: prepare it for trial." },

  // ---- Home: Counties band ----
  { key: "home.counties.eyebrow", page: "home", section: "countiesBand", label: "Eyebrow", type: "text", value: "Reach" },
  { key: "home.counties.heading", page: "home", section: "countiesBand", label: "Heading", type: "text", value: "Counties & courts where we practice." },
  { key: "home.counties.body", page: "home", section: "countiesBand", label: "Body", type: "text", value: "Litigation experience across North and Central Texas, plus the federal courts." },

  // ---- Home: Quote ----
  { key: "home.quote.text", page: "home", section: "quote", label: "Quote text", type: "text", value: QUOTES.clayton.text },
  { key: "home.quote.attribution", page: "home", section: "quote", label: "Quote attribution", type: "text", value: QUOTES.clayton.attribution },
  { key: "home.quote.image", page: "home", section: "quote", label: "Quote background photo (shown behind the quote, under a dark scrim)", type: "image", value: "" },

  // ---- Home: Offices band ----
  { key: "home.offices.eyebrow", page: "home", section: "officesBand", label: "Eyebrow", type: "text", value: "Offices" },
  { key: "home.offices.heading", page: "home", section: "officesBand", label: "Heading", type: "text", value: "Three offices. One litigation hub." },

  // ---- About ----
  { key: "about.hero.eyebrow", page: "about", section: "hero", label: "Eyebrow", type: "text", value: "Our Team" },
  { key: "about.hero.heading", page: "about", section: "hero", label: "Heading", type: "text", value: "The people behind the firm." },
  { key: "about.hero.subhead", page: "about", section: "hero", label: "Subhead", type: "text", value: "Born and raised in Fort Worth. Texas roots since the 1800s. A trial lawyer who litigates cases and handles transactional matters and estate planning as well." },
  { key: "about.team.heading", page: "about", section: "team", label: "Team section heading", type: "text", value: "Our Texas Team" },
  { key: "about.portrait", page: "about", section: "bio", label: "Attorney portrait", type: "image", value: "" },
  { key: "about.bio.body", page: "about", section: "bio", label: "Biography", type: "richtext", value: "<p>Max Smith was born and raised in Fort Worth. He graduated from Arlington Heights High School in 2010 in the top ten percent of his class, played football and baseball, and earned the rank of Eagle Scout. He finished his B.A. in History at Southwestern University in three calendar years while playing varsity baseball, then earned an M.B.A. and a J.D. from Texas Tech.</p><p>He has been licensed since 2018 and has handled over a thousand legal matters — jury trials, bench trials, and appeals — across North and Central Texas and in federal court. He practiced with a Fort Worth firm before founding his own.</p><p>His family has farmed and ranched in southern Bosque County since the mid-1800s. Max and his wife help maintain the family farm and a small cattle operation today.</p>" },
  { key: "about.quote.text", page: "about", section: "quote", label: "Quote", type: "text", value: QUOTES.handshake.text },
  { key: "about.quote.attribution", page: "about", section: "quote", label: "Quote attribution", type: "text", value: QUOTES.handshake.attribution },

  // ---- Contact ----
  { key: "contact.hero.eyebrow", page: "contact", section: "hero", label: "Eyebrow", type: "text", value: "Contact" },
  { key: "contact.hero.heading", page: "contact", section: "hero", label: "Heading", type: "text", value: "Talk to the firm." },
  { key: "contact.hero.body", page: "contact", section: "hero", label: "Body", type: "text", value: "Nobody ever wants to need a lawyer. When you do, you want one who will get you the answers you need — not one who will pass the buck." },

  // ---- Footer ----
  { key: "footer.blurb", page: "footer", section: "main", label: "Footer blurb", type: "text", value: "A Texas trial firm. Prepared for trial from day one." },
  { key: "footer.disclaimer", page: "footer", section: "legal", label: "Footer disclaimer", type: "richtext", value: `<p>This website is for informational purposes only and does not constitute legal advice. Viewing this site or contacting the firm does not create an attorney-client relationship. Do not send confidential information until an attorney-client relationship has been established in writing.</p><p>Principal office: Meridian, Texas. The attorney responsible for this site is Thomas Maxwell Smith. ${FIRM.name}.</p>` },
  { key: "footer.results.disclaimer", page: "footer", section: "legal", label: "Results disclaimer", type: "text", value: "Past results do not guarantee a similar outcome. Each case depends on its own facts and circumstances." },

  // ---- Consultation / Intake ----
  { key: "intake.hero.heading", page: "consultation", section: "hero", label: "Heading", type: "text", value: "What brings you in?" },
  { key: "intake.hero.body", page: "consultation", section: "hero", label: "Body", type: "text", value: "Tell us what is going on. Start typing, or pick what fits. This takes a couple of minutes." },
  { key: "intake.consent", page: "consultation", section: "consent", label: "Consent language", type: "text", value: "Submitting this form does not create an attorney-client relationship. Please do not send confidential or time-sensitive details here. We will follow up to discuss your matter." },

  // ---- Payment ----
  { key: "payment.heading", page: "payment", section: "main", label: "Heading", type: "text", value: "Make a Payment" },
  { key: "payment.body", page: "payment", section: "main", label: "Body", type: "text", value: "Pay securely through the firm's payment portal." },
  { key: "payment.url", page: "payment", section: "main", label: "Clio payment link", type: "url", value: "https://app.clio.com/link/v2/2/2/8d238d952200edf08657e749c231dc5d?hmac=0350ff9c5acc29605730ca8904589ed49123ea2654b4781f2b6b4dba5d9f2d51" },

  // ---- Page banner images (the photo behind each page's navy header) ----
  { key: "about.hero.image", page: "about", section: "banner", label: "Page banner photo (behind the navy header)", type: "image", value: "" },
  { key: "contact.hero.image", page: "contact", section: "banner", label: "Page banner photo (behind the navy header)", type: "image", value: "" },
  { key: "consultation.hero.image", page: "consultation", section: "banner", label: "Page banner photo (behind the navy header)", type: "image", value: "" },
  { key: "payment.hero.image", page: "payment", section: "banner", label: "Page banner photo (behind the navy header)", type: "image", value: "" },
  { key: "results.hero.image", page: "results", section: "banner", label: "Page banner photo (behind the navy header)", type: "image", value: "" },
  { key: "blog.hero.image", page: "blog", section: "banner", label: "Page banner photo (behind the navy header)", type: "image", value: "" },
  { key: "glossary.hero.image", page: "glossary", section: "banner", label: "Page banner photo (behind the navy header)", type: "image", value: "" },
  { key: "practiceareas.hero.image", page: "practiceareas", section: "banner", label: "Page banner photo (behind the navy header)", type: "image", value: "" },
];

export const BLOCK_DEFAULTS: Record<string, string> = Object.fromEntries(
  CONTENT_BLOCKS.map((b) => [b.key, b.value]),
);
