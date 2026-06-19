/**
 * Voice microphone + engine state machine (see VOICE-ARCHITECTURE.md).
 *
 * The hard rule this exists to enforce: KNOW the permission state before acting,
 * preserve the user gesture, and auto-recover when the state changes. Permission
 * queries/watchers are gesture-free (call any time). `requestMic` MUST be called
 * synchronously inside a tap handler with no awaits before it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { detectPlatform, micAllowSteps, type Platform } from "@/lib/platform";

export type MicState = "unknown" | "unsupported" | "granted" | "prompt" | "denied";
export type Group = "chromium" | "safari" | "none";

export function hasSpeechRecognition(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}
export function hasTTS(): boolean {
  return typeof window !== "undefined" && Boolean(window.speechSynthesis);
}
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches) || (navigator as any).standalone === true;
}
export function isSecure(): boolean {
  return typeof window === "undefined" ? true : window.isSecureContext !== false;
}

/** Which engine group the current browser falls into. */
export function engineGroup(p: Platform = detectPlatform()): Group {
  if (!hasSpeechRecognition()) return "none";
  if (p.browser === "safari") return "safari";
  return "chromium";
}

/** Read the mic permission via the Permissions API. Returns "unknown" where the
 *  API (or the mic descriptor) isn't available (Safari/Firefox). No gesture. */
export async function queryMic(): Promise<MicState> {
  try {
    const perms = (navigator as any).permissions;
    if (!perms?.query) return "unknown";
    const st = await perms.query({ name: "microphone" as PermissionName });
    const s = st?.state;
    return s === "granted" || s === "denied" || s === "prompt" ? s : "unknown";
  } catch {
    return "unknown";
  }
}

/** Watch the mic permission for live changes (Chromium). Returns an unsubscribe.
 *  Lets a denied → allowed flip auto-recover with no page reload. */
export async function watchMic(cb: (s: MicState) => void): Promise<() => void> {
  try {
    const perms = (navigator as any).permissions;
    if (!perms?.query) return () => {};
    const st = await perms.query({ name: "microphone" as PermissionName });
    const handler = () => {
      const s = st?.state;
      cb(s === "granted" || s === "denied" || s === "prompt" ? s : "unknown");
    };
    st.addEventListener?.("change", handler);
    return () => st.removeEventListener?.("change", handler);
  } catch {
    return () => {};
  }
}

export type MicResult = { ok: true } | { ok: false; error: string; reason: MicFail };
export type MicFail = "denied" | "no-device" | "busy" | "insecure" | "unavailable" | "other";

/** Request the mic. MUST run synchronously inside a user gesture (no await
 *  before it) or the gesture is lost and it throws NotAllowedError spuriously. */
export async function requestMic(): Promise<MicResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: "Unavailable", reason: isSecure() ? "unavailable" : "insecure" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e: any) {
    const name = e?.name || "Error";
    const reason: MicFail =
      name === "NotAllowedError" || name === "SecurityError" ? "denied"
      : name === "NotFoundError" || name === "DevicesNotFoundError" ? "no-device"
      : name === "NotReadableError" || name === "TrackStartError" ? "busy"
      : name === "TypeError" ? "insecure"
      : "other";
    return { ok: false, error: name, reason };
  }
}

/** Human guidance for a failure reason, tailored to the device. */
export function failGuidance(reason: MicFail, p: Platform = detectPlatform()): string {
  switch (reason) {
    case "denied": return `Microphone is turned off for this site. ${micAllowSteps(p)}`;
    case "no-device": return "No microphone was found on this device. Use a device with a mic (your phone has one built in).";
    case "busy": return "The microphone is in use by another app (a call, camera, recorder…). Close it, then try again.";
    case "insecure": return "Voice needs a secure (https) page. Open the site at its https address.";
    case "unavailable": return "This browser can't access a microphone.";
    default: return "The microphone couldn't start. Try again, or check this site's microphone permission.";
  }
}

export function unsupportedGuidance(p: Platform = detectPlatform()): string {
  if (p.browser === "firefox") return "Firefox doesn't support voice typing. Use Chrome, Edge, or Safari — or just type the entry below.";
  if (p.os === "ios") return "On iPhone/iPad, voice works in Safari. Open this site in Safari — or just type the entry below.";
  return "This browser doesn't support voice typing. Use Chrome, Edge, or Safari — or just type the entry below.";
}
