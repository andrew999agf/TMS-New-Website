/**
 * Lightweight platform/browser detection used to give the *right* microphone
 * instructions per device — the permission UI differs a lot across iOS,
 * Android, Windows, and macOS, and across Chrome/Safari/Edge/Firefox/Samsung.
 */

export type OS = "ios" | "android" | "windows" | "macos" | "linux" | "other";
export type Browser = "chrome" | "edge" | "safari" | "firefox" | "samsung" | "other";

export type Platform = { os: OS; browser: Browser; mobile: boolean; label: string };

export function detectPlatform(ua?: string): Platform {
  const s = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const touchPoints = typeof navigator !== "undefined" ? (navigator.maxTouchPoints || 0) : 0;
  const isIPadOS = /Macintosh/.test(s) && touchPoints > 1; // iPad reports as Mac

  let os: OS = "other";
  if (/iPhone|iPad|iPod/.test(s) || isIPadOS) os = "ios";
  else if (/Android/.test(s)) os = "android";
  else if (/Windows/.test(s)) os = "windows";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macos";
  else if (/Linux/.test(s)) os = "linux";

  let browser: Browser = "other";
  if (/SamsungBrowser/.test(s)) browser = "samsung";
  else if (/Edg\//.test(s)) browser = "edge";
  else if (/Firefox\//.test(s) || /FxiOS/.test(s)) browser = "firefox";
  else if (/CriOS/.test(s)) browser = "chrome"; // Chrome on iOS (WebKit underneath)
  else if (/Chrome\//.test(s) && !/OPR\//.test(s)) browser = "chrome";
  else if (/Safari\//.test(s)) browser = "safari";

  const mobile = os === "ios" || os === "android";
  const osName = { ios: "iPhone/iPad", android: "Android", windows: "Windows", macos: "Mac", linux: "Linux", other: "this device" }[os];
  const brName = { chrome: "Chrome", edge: "Edge", safari: "Safari", firefox: "Firefox", samsung: "Samsung Internet", other: "your browser" }[browser];
  return { os, browser, mobile, label: `${brName} on ${osName}` };
}

/** Step-by-step instructions to un-block the microphone for the current site. */
export function micAllowSteps(p: Platform): string {
  if (p.os === "ios") {
    return p.browser === "safari"
      ? "iPhone/iPad (Safari): tap the “aA” (or ⋯) on the address bar ▸ Website Settings ▸ Microphone ▸ Allow. If there was no prompt, also check Settings ▸ Apps ▸ Safari ▸ Microphone, and Settings ▸ Privacy & Security ▸ Microphone."
      : "iPhone/iPad: open this site in Safari for the best support. Then check Settings ▸ Privacy & Security ▸ Microphone, and the site's permissions, and reload.";
  }
  if (p.os === "android") {
    return p.browser === "samsung"
      ? "Android (Samsung Internet): tap the lock icon left of the address ▸ Permissions ▸ Microphone ▸ Allow, or Settings ▸ Apps ▸ Samsung Internet ▸ Permissions ▸ Microphone. Then reload."
      : "Android: tap the lock or tune icon left of the web address ▸ Permissions ▸ Microphone ▸ Allow (or Chrome ⋮ ▸ Settings ▸ Site settings ▸ Microphone). Also check Settings ▸ Apps ▸ Chrome ▸ Permissions ▸ Microphone. Then reload.";
  }
  if (p.browser === "safari") {
    return "Mac (Safari): Safari ▸ Settings ▸ Websites ▸ Microphone ▸ set this site to Allow; and System Settings ▸ Privacy & Security ▸ Microphone ▸ turn Safari ON. Then reload.";
  }
  if (p.browser === "firefox") {
    return "Firefox: click the permissions/microphone icon at the left of the address bar ▸ clear the block / Allow. Then reload.";
  }
  // Chrome / Edge on desktop
  const osStep = p.os === "macos"
    ? "macOS: System Settings ▸ Privacy & Security ▸ Microphone ▸ turn this browser ON (then reopen it)."
    : p.os === "windows"
    ? "Windows: Settings ▸ Privacy & security ▸ Microphone ▸ turn on Microphone access and “Let desktop apps access your microphone.”"
    : "";
  return `Click the microphone icon at the right end of the address bar ▸ Allow, then reload.${osStep ? " Also: " + osStep : ""}`;
}
