# Voice Entry Architecture (Time Tracker 3.0)

The job of this system: take a tap, get the microphone working **within the
rules of whatever browser/OS/install context the user is in**, then run the
voice capture. Every past failure has been in the *permission* layer, not the
capture layer. This document is the full map.

---

## 0. The one hard truth that governs everything

A website **cannot** force-grant itself microphone access, and **cannot**
re-show the "Allow microphone?" popup once a user/browser has set the site to
*denied*. This is identical for every site on earth (Zoom included). So the
system's job is not to "make it work no matter what" — it's to:

1. **Know** the exact permission state *before* acting (never guess).
2. Drive the **correct workflow** for that state + platform.
3. **Auto-recover** the instant the state changes (e.g. user flips a setting).
4. When a manual reset is genuinely required, give the **exact** steps for that
   device and detect the moment it's fixed.

`NotAllowedError` with no popup = state is **denied** (a real block or Chrome's
auto-"embargo" after a prompt is dismissed several times). The only fix is a
one-time settings reset. The system must *recognize* this, not pretend.

---

## 1. The capability matrix (what actually differs)

| Context | Speech-to-text (SpeechRecognition) | Permissions API (mic) | TTS (speechSynthesis) | Permission reset path |
|---|---|---|---|---|
| **Chrome — Android** | ✅ (Google cloud) | ✅ query + change events | ✅ | Lock/tune icon ▸ Permissions ▸ Microphone; or ⋮ ▸ Site settings |
| **Chrome / Edge — desktop** | ✅ (Google/Azure cloud) | ✅ | ✅ | Address-bar 🎤 icon ▸ Allow; + OS mic privacy (Win/macOS) |
| **Samsung Internet — Android** | ✅ (Chromium) | ✅ | ✅ | Lock icon ▸ Permissions; or app settings |
| **Safari — iOS (iPhone/iPad)** | ✅ (iOS 14.5+) | ❌ no mic query | ✅ (voices load async; needs gesture) | "aA"/site menu ▸ Microphone; Settings ▸ Safari ▸ Microphone |
| **Safari — macOS** | ✅ (14.1+) | ❌ | ✅ | Safari ▸ Settings ▸ Websites ▸ Microphone; + System Settings ▸ Privacy ▸ Microphone |
| **Firefox — any** | ❌ **none** | partial | ✅ | n/a — no speech recognition exists |
| **Chrome/Firefox — iOS** | ⚠️ WebKit underneath; recognition often **not exposed** | ❌ | ✅ | recommend Safari on iOS |

### Collapses into THREE engine groups:

- **Group A — Chromium** (Chrome/Edge/Samsung, desktop + Android):
  full Permissions API → we can *know* the state and *watch* for changes.
- **Group B — Safari** (iOS + macOS):
  no mic Permissions API → we *cannot* pre-check; we must attempt the request in
  a gesture and classify the result. Recognition works. Voices load async.
- **Group C — No-recognition** (Firefox everywhere; non-Safari iOS browsers):
  `SpeechRecognition` does not exist → voice capture is impossible. Fall back to
  the manual typed form (already present) and say so plainly.

The **install dimension** (browser tab vs installed PWA / Add-to-Home-Screen)
does **not** change the permission *code* — same origin, same permission. It
only changes the *reset instructions wording* and the standalone detection.

---

## 2. The permission state machine (the core)

```
MicState = unknown | unsupported | granted | prompt | denied

ENGINE CHECK (on mount, no gesture needed):
  hasSpeechRecognition() === false  →  state = unsupported   (Group C)
  else  →  query permission:
            Group A (Permissions API): granted | prompt | denied
            Group B (Safari, no API):  unknown   (we learn on first request)

WATCH (Group A only): subscribe to permission 'change' events → update state
  live, so flipping a browser setting auto-recovers with no reload.

ON "START VOICE" TAP (this handler must do the request with NO await before it,
or the browser drops the user-gesture and throws NotAllowedError even when the
state is 'prompt' — THIS is the classic bridge bug):

  switch (cachedState):
    unsupported → show "use Chrome/Edge/Safari (or just type)"; stop.
    granted     → start capture immediately.
    denied      → show platform-specific reset steps; keep watching; when the
                  watcher reports granted/prompt → auto-continue.
    prompt|unknown → requestMic() SYNCHRONOUSLY in this gesture:
                       ok            → start capture.
                       error NotAllowedError → state = denied → reset screen.
                       error NotFoundError   → "no microphone on this device".
                       error NotReadableError→ "mic busy in another app".
                       error (other/TypeError) → show the raw name (likely
                                                 insecure origin / policy).
```

### The two non-negotiable implementation rules

1. **Gesture preservation.** In the tap handler, branch on a *cached* state
   (read synchronously, no `await`) and call `getUserMedia` immediately. Any
   `await` before the request consumes the user gesture → spurious
   `NotAllowedError`. (Permissions are queried on mount/idle, never in the tap.)
2. **One mic grant, then reuse.** `getUserMedia` in the gesture grants the
   permission; the recognizer (`SpeechRecognition.start()`, which runs later
   after the TTS prompt — i.e. *outside* a gesture) then works because the grant
   already exists. This is the bridge between "tap" and "the recognizer that
   fires three seconds later."

---

## 3. Workflows per group (what the user sees)

**Group A (Chromium):** We always *know* the state.
- granted → tap mic → it just records. No friction, ever.
- prompt → tap mic → native Allow popup → records.
- denied → a single clear screen: "Microphone is off for this site — here's the
  one-time fix" with the exact path, and it **auto-continues** the moment the
  permission flips (change event), no reload needed.

**Group B (Safari):** We can't pre-check.
- tap mic → request in gesture → popup (if allowed) → records; if it throws,
  show the iOS/macOS reset path. (No live watcher, so a "Try again" button.)

**Group C (Firefox / no recognition):**
- Don't pretend. One line: "Voice isn't supported in this browser — use Chrome,
  Edge, or Safari, or just type the entry below." The typed form stays fully
  usable.

---

## 4. Diagnostics (so we never guess again)

A always-available "details" line shows: `device` (browser+OS), `engine`
(recognition yes/no), `permission` (granted/prompt/denied/unknown), `secure`
(https), and the last raw error. If permission reads **denied**, that is proof
it's a device-state block (reset needed), not a code bug — settling the question
factually instead of by argument.

---

## 5. What 3.0 reuses vs. rebuilds

- **Rebuild:** the entire mic-permission front-end (the state machine above),
  isolated in `src/lib/voice-mic.ts` + a clean gate UI.
- **Reuse unchanged:** the proven capture flow (3 short spoken parts, green/red
  buttons, candidate picker, editable review, verbal Save, another-entry loop,
  matter/rate/date parsing) and the natural-voice picker.
- **Engine:** browser `SpeechRecognition` (reliable today). On-device Whisper
  can later slot in behind the *same* gate, with a real device to test on.

3.0 is a separate tab. 1.0 and 2.0 are untouched. Same database, same CSV.
