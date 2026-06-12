import { getPost, getPracticeArea } from "@/lib/content";
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "T. Maxwell Smith, PLLC — Insights";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  const eyebrow = post?.category ? (await getPracticeArea(post.category))?.title ?? "Insights" : "Insights";
  return ogCard({ eyebrow, title: post?.title ?? "Insights" });
}
