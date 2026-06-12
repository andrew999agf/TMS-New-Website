import { getPracticeArea } from "@/lib/content";
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "T. Maxwell Smith, PLLC — Practice Area";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pa = await getPracticeArea(slug);
  return ogCard({ eyebrow: "Practice Area", title: pa?.title ?? "Practice Area" });
}
