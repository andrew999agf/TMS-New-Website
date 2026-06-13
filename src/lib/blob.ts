/**
 * Vercel Blob configuration detection.
 *
 * A project can be connected to a Blob store two ways:
 *  - the classic static token (BLOB_READ_WRITE_TOKEN), or
 *  - the newer OIDC connection, which injects BLOB_STORE_ID and lets the
 *    @vercel/blob SDK authenticate with the project's OIDC token automatically.
 *
 * Either one means uploads will work, so we treat both as "configured."
 */
export function isBlobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_STORE_ID ||
      process.env.VERCEL_OIDC_TOKEN,
  );
}
