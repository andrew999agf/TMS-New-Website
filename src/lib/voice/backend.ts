/**
 * Capability probe (Time Tracker 3.0). Runs once at startup and decides the
 * per-device "knobs" the rest of the pipeline uses (see VOICE-ARCHITECTURE.md
 * work paths): how we capture audio, which inference backend to run, and which
 * permission model applies. Gesture-free, no I/O, cheap.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { detectPlatform, type Platform } from "@/lib/platform";

export type CaptureKind = "audioworklet" | "scriptprocessor" | "none";
export type Backend = "webgpu" | "wasm" | "none";
export type PermissionModel = "query-watch" | "request-classify";

export type Capability = {
  platform: Platform;
  capture: CaptureKind;
  backend: Backend;
  permissionModel: PermissionModel;
  secure: boolean;
  standalone: boolean;
  hasGetUserMedia: boolean;
  hasWasm: boolean;
  hasWebGPU: boolean;
};

function hasAudioContext(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).AudioContext || (window as any).webkitAudioContext);
}
function hasAudioWorklet(): boolean {
  if (!hasAudioContext()) return false;
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  return Boolean(AC?.prototype?.audioWorklet) || typeof (AudioWorkletNode as any) !== "undefined";
}
function hasScriptProcessor(): boolean {
  if (!hasAudioContext()) return false;
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  return typeof AC?.prototype?.createScriptProcessor === "function";
}
export function hasWasm(): boolean {
  try {
    return typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
  } catch {
    return false;
  }
}
export async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as any)?.gpu;
    if (!gpu?.requestAdapter) return false;
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

export function isSecure(): boolean {
  return typeof window === "undefined" ? true : window.isSecureContext !== false;
}
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches) || (navigator as any).standalone === true;
}

/** Probe the device once. WebGPU detection is async (adapter request). */
export async function probeCapability(): Promise<Capability> {
  const platform = detectPlatform();
  const capture: CaptureKind = hasAudioWorklet() ? "audioworklet" : hasScriptProcessor() ? "scriptprocessor" : "none";
  const wasm = hasWasm();
  const webgpu = await hasWebGPU();
  // Safari has no WebGPU yet and no mic Permissions API → wasm + request-classify.
  const backend: Backend = webgpu ? "webgpu" : wasm ? "wasm" : "none";
  const permissionModel: PermissionModel =
    platform.browser !== "safari" && typeof (navigator as any)?.permissions?.query === "function"
      ? "query-watch"
      : "request-classify";
  return {
    platform,
    capture,
    backend,
    permissionModel,
    secure: isSecure(),
    standalone: isStandalone(),
    hasGetUserMedia: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    hasWasm: wasm,
    hasWebGPU: webgpu,
  };
}
