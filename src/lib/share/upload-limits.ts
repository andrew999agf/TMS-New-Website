/** Upload limits for share folders — shared by the admin and recipient Blob
 *  upload authorizers so the two lists never drift apart. */

export const SHARE_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB per file (video can be large)

export const SHARE_ALLOWED_CONTENT_TYPES = [
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/rtf",
  "application/zip",
  "message/rfc822",
  "application/octet-stream",
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/heic",
  "image/heif",
  // Video — the common formats phones and cameras produce
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/x-matroska", // .mkv
  "video/webm",
  "video/mpeg",
  "video/3gpp", // .3gp
  "video/3gpp2",
  "video/x-ms-wmv", // .wmv
  "video/x-flv",
  "video/x-m4v",
  "video/avi",
  // Audio
  "audio/mpeg", // .mp3
  "audio/mp4", // .m4a
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/3gpp",
];
