import { ImageResponse } from "next/og";

/**
 * Default branded social-share card, used site-wide for OpenGraph and Twitter
 * unless a route provides its own. On-brand with the default Oxblood & Bone
 * palette (OG images are generated outside the live-theme context).
 */
export const alt = "T. Maxwell Smith, PLLC — Trial lawyers for the whole of Texas law.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
              color: "#a89e92",
              fontSize: 24,
              letterSpacing: 6,
              textTransform: "uppercase",
              fontFamily: "Arial, sans-serif",
            }}
          >
            Fort Worth · Meridian · Weatherford, Texas
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#f4efe7", fontSize: 76, lineHeight: 1.05, maxWidth: 1000 }}>
            Trial lawyers for the whole of Texas law.
          </div>
          <div style={{ color: "#a89e92", fontSize: 30, marginTop: 24, fontFamily: "Arial, sans-serif" }}>
            Prepared for trial. From day one.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ color: "#f4efe7", fontSize: 34 }}>T. Maxwell Smith, PLLC</div>
          <div style={{ color: "#c46a52", fontSize: 24, fontFamily: "Arial, sans-serif" }}>texaslawsmith.com</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
