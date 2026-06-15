/**
 * Route uploaded media (Vercel Blob) through the site's own domain so it loads
 * on networks/browsers that block the *.blob.vercel-storage.com CDN. The blob
 * URL is base64url-encoded so the blocked CDN hostname never appears anywhere
 * in the request the browser makes — many corporate/legal web filters match the
 * domain string even inside a query parameter. If encoding ever fails, we fall
 * back to the direct URL so images are never worse off than before. Non-blob
 * URLs pass through unchanged.
 */
export function media(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (!url.includes(".blob.vercel-storage.com")) return url;
  try {
    const b64 = btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `/api/img?u=${b64}`;
  } catch {
    return url;
  }
}
