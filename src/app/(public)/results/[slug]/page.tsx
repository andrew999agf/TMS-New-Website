import { permanentRedirect } from "next/navigation";

/** Result detail pages live in the blog now; old links keep working. */
export default async function ResultDetailRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/blog/results/${slug}`);
}
