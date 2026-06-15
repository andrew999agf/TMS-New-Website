/**
 * Route uploaded media (Vercel Blob) through the site's own domain so it loads
 * on networks/browsers that block the *.blob.vercel-storage.com CDN. Non-blob
 * URLs (and empty values) pass through unchanged.
 */
export function media(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.includes(".blob.vercel-storage.com")) return `/api/img?u=${encodeURIComponent(url)}`;
  return url;
}
