/** A short, honest reason for a failed share upload, from whatever was thrown. */
export function uploadFailureReason(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err ?? "");
  if (/retrieve the client token/i.test(m)) return "the server refused it (check your sign-in, then try again)";
  if (/content type is not allowed/i.test(m)) return "that file type isn't accepted";
  if (/too large|maximumSizeInBytes|exceeds/i.test(m)) return "it's over the 2 GB limit";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "the connection dropped";
  return m.replace(/^Vercel Blob:\s*/i, "").trim() || "unknown error";
}
