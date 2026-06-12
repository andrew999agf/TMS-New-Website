import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** Branded OG card with a custom eyebrow + title (posts, practice areas, team). */
export function ogCard({ eyebrow, title }: { eyebrow: string; title: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#14110f",
          padding: "72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 4, background: "#c46a52" }} />
          <div
            style={{
              color: "#c46a52",
              fontSize: 22,
              letterSpacing: 5,
              textTransform: "uppercase",
              fontFamily: "Arial, sans-serif",
            }}
          >
            {eyebrow}
          </div>
        </div>

        <div
          style={{
            color: "#f4efe7",
            fontSize: title.length > 70 ? 56 : 68,
            lineHeight: 1.08,
            maxWidth: 1040,
            display: "flex",
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ color: "#f4efe7", fontSize: 30 }}>T. Maxwell Smith, PLLC</div>
          <div style={{ color: "#a89e92", fontSize: 22, fontFamily: "Arial, sans-serif" }}>
            texaslawsmith.com
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
