import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Allow the microphone for our OWN origin only (the Time Tracker voice entry
  // needs it); still deny camera/geolocation and deny the mic to any third-party
  // iframe. `microphone=()` here previously blocked our own pages too, which
  // made SpeechRecognition / getUserMedia throw "not-allowed" no matter what the
  // user's browser or OS mic setting was.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Vercel Blob public storage (media library uploads).
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // YouTube poster frames for the lite embed.
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
