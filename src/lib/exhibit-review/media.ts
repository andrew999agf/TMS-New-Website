/**
 * Video detection shared by the exhibit reviewer, the share-link viewers, and
 * the download routes. Client-safe (no server-only imports).
 */

/** The common formats phones, cameras, and dash/body cams produce. */
export const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|avi|mkv|mpe?g|wmv|3gp|3g2|flv|ogv)(\?.*)?$/i;

/** accept= value for exhibit pickers: PDFs plus the common video formats. */
export const EXHIBIT_ACCEPT = "application/pdf,.pdf,video/*,.mp4,.m4v,.mov,.webm,.avi,.mkv,.mpg,.mpeg,.wmv,.3gp,.ogv";

export function isVideoFile(name?: string | null, contentType?: string | null): boolean {
  if (contentType && contentType.toLowerCase().startsWith("video/")) return true;
  return !!name && VIDEO_EXT_RE.test(name);
}

export function isPdfFile(name?: string | null, contentType?: string | null): boolean {
  if (contentType && contentType.toLowerCase() === "application/pdf") return true;
  return !!name && /\.pdf(\?.*)?$/i.test(name);
}
