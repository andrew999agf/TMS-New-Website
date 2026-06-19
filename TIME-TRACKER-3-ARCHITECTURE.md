# Time Tracker 3.0 — Voice Entry: Complete Architecture & Build Plan

> Scope lock: **1.0 and 2.0 are frozen.** Nothing in this plan modifies them.
> Everything below is the ground-up design for the 3.0 tab and its supporting
> libraries. This is the whole building, floor by floor, wire by wire.

---

## 0. THE PROBLEM, STATED PRECISELY

Voice time entry has three subsystems that must each work on every target
device, and a fourth that glues them together:

1. **MIC PERMISSION** — getting the OS/browser to let us hear the user.
2. **STT (speech-to-text)** — turning their speech into words.
3. **TTS (text-to-speech)** — speaking prompts/read-backs back to them.
4. **THE CONVERSATION ENGINE** — the slot-filling dialog that turns words into
   a billable time entry (case, rate, date, hours, category, note).

Every failure in the last two days lived in **#1 (permission)** and in the
**glue** (#4 calling #1/#2 at the wrong time, losing the user gesture). #2/#3
are well-understood and stable once #1 is solved. So 3.0 is **architected
around the permission state machine**, with the rest as clean, swappable
subsystems.

### The single immovable law (memorize this)

> A web page **cannot** grant itself the microphone, **cannot** silently
> re-prompt once a site is set to "blocked," and **cannot** read or write OS
> privacy settings. The browser is the gatekeeper. Our job is to *know the
> gate's state, drive the right flow, and recover the moment it opens* — never
> to pretend we can force it.

Corollaries that have bitten us:
- `getUserMedia` rejecting with `NotAllowedError` **and no popup** = the state
  is already `denied` (manual block, or Chrome's "embargo" after the prompt was
  dismissed/ignored ~3 times). Only a manual settings reset fixes it.
- `getUserMedia`/`SpeechRecognition.start()` must be called inside a **transient
  user activation** (a tap). If our code `await`s *anything* between the tap and
  the call, the activation is consumed → spurious `NotAllowedError`.
- iOS Safari **standalone PWAs** could not use `getUserMedia` at all before
  **iOS 16.4**. This is a real, version-gated landmine.

---

## 1. TARGET MATRIX — EVERY DEVICE × BROWSER × CONTEXT

### 1.1 The raw matrix

| # | OS | Browser | In-browser tab | Installed PWA / Home-screen | STT (SpeechRecognition) | TTS | Permissions API (mic) | Permission reset path |
|---|----|---------|----------------|------------------------------|--------------------------|-----|------------------------|-----------------------|
| 1 | Android | Chrome | ✅ | ✅ (Add to Home / Install) | ✅ Google cloud | ✅ | ✅ query+watch | Lock/tune icon ▸ Permissions ▸ Microphone; or ⋮ ▸ Site settings ▸ Microphone; OS: Settings ▸ Apps ▸ Chrome ▸ Permissions |
| 2 | Android | Samsung Internet | ✅ | ✅ | ✅ Chromium | ✅ | ✅ | Lock icon ▸ Permissions; Settings ▸ Apps ▸ Samsung Internet ▸ Permissions |
| 3 | Android | Firefox | ✅ | ⚠️ | ❌ none | ✅ | partial | n/a (no STT) |
| 4 | Android | Edge | ✅ | ✅ | ✅ | ✅ | ✅ | like Chrome |
| 5 | iOS/iPadOS | Safari | ✅ | ✅ (Add to Home, **iOS 16.4+** for mic in standalone) | ✅ (iOS 14.5+) | ✅ (gesture-gated, async voices) | ❌ no mic query | "aA"/site menu ▸ Microphone; Settings ▸ Safari ▸ Microphone; Settings ▸ Privacy ▸ Microphone |
| 6 | iOS/iPadOS | Chrome/Edge/Firefox | ✅ (all are WebKit) | ⚠️ | ⚠️ usually **not exposed** in non-Safari iOS | ✅ | ❌ | recommend Safari |
| 7 | macOS | Safari | ✅ | ✅ (Add to Dock, macOS Sonoma+) | ✅ (14.1+) | ✅ | ❌ | Safari ▸ Settings ▸ Websites ▸ Microphone; System Settings ▸ Privacy ▸ Microphone ▸ Safari |
| 8 | macOS | Chrome/Edge | ✅ | ✅ (Install) | ✅ cloud | ✅ | ✅ | Address-bar 🎤 ▸ Allow; System Settings ▸ Privacy ▸ Microphone ▸ Chrome |
| 9 | macOS | Firefox | ✅ | ⚠️ | ❌ | ✅ | partial | n/a |
| 10 | Windows | Chrome/Edge | ✅ | ✅ | ✅ cloud | ✅ | ✅ | Address-bar 🎤 ▸ Allow; Settings ▸ Privacy ▸ Microphone ▸ "let desktop apps…" |
| 11 | Windows | Firefox | ✅ | ⚠️ | ❌ | ✅ | partial | n/a |
| 12 | ChromeOS | Chrome | ✅ | ✅ | ✅ | ✅ | ✅ | like desktop Chrome |

### 1.2 The matrix collapses to THREE engine groups

Do not write 12 code paths. Write three, keyed on capability:

- **GROUP A — CHROMIUM** (rows 1,2,4,8,10,12): Permissions API works →
  we can **know** and **watch** the permission. STT cloud. The "smart" path.
- **GROUP B — SAFARI/WEBKIT** (rows 5,7): No mic Permissions API → we **cannot
  pre-check**; we attempt the request inside a gesture and **classify the
  result**. STT works. TTS voices load async + need a gesture to unlock. iOS
  standalone needs iOS ≥ 16.4 for mic.
- **GROUP C — NO-STT** (rows 3,6,9,11): `SpeechRecognition` does not exist →
  voice capture is impossible. **Degrade gracefully** to the typed form and tell
  the user plainly which browsers do support voice.

**Install context** (tab vs installed/standalone) changes **none** of the
permission *code* — same origin, same stored permission. It only changes (a) the
*reset-instructions wording*, (b) the iOS-version gate, and (c) cosmetic
standalone detection. So: **3 engine groups × small platform-specific copy**,
not a combinatorial explosion.

---

## 2. THE PERMISSION STATE MACHINE (the spine)

### 2.1 States

```
MicState =
  | "unknown"      // not yet determined (Safari before first request, etc.)
  | "unsupported"  // no SpeechRecognition in this browser (Group C)
  | "insecure"     // page not https → getUserMedia unavailable
  | "no-device"    // browser reports no microphone hardware
  | "prompt"       // never decided; a request will show the native popup
  | "granted"      // allowed; go straight to capture
  | "denied"       // blocked/embargoed; needs a manual one-time reset
```

### 2.2 Inputs / signals

- `engineGroup()` — chromium | safari | none (from UA + feature detection).
- `navigator.permissions.query({name:"microphone"})` — Group A only; returns
  granted|prompt|denied, plus a `change` event to **watch**.
- `navigator.mediaDevices.getUserMedia({audio:true})` — the actual request;
  resolves (granted) or rejects with a typed error.
- `navigator.mediaDevices.enumerateDevices()` — to confirm a mic exists (labels
  hidden until permission, but device *presence* is visible).
- `window.isSecureContext` — https gate.
- `matchMedia("(display-mode: standalone)")` / `navigator.standalone` — install.

### 2.3 Transition table (the whole truth)

| From | Event | To | Action |
|------|-------|----|--------|
| (mount) | engineGroup === none | unsupported | render Group C screen; typed form only |
| (mount) | !isSecureContext | insecure | render insecure screen |
| (mount, Group A) | query → granted | granted | ready; mic button starts capture instantly |
| (mount, Group A) | query → prompt | prompt | ready; mic button will trigger native popup |
| (mount, Group A) | query → denied | denied | show reset gate; **arm the watcher** |
| (mount, Group B) | (no API) | unknown | ready; learn on first request |
| prompt/unknown | user taps mic → requestMic() ok | granted | start capture |
| prompt/unknown | requestMic() reject NotAllowedError | denied | reset gate + watcher |
| prompt/unknown | requestMic() reject NotFoundError | no-device | "no mic" screen |
| prompt/unknown | requestMic() reject NotReadableError | (stay) | "mic busy" toast + Try again |
| prompt/unknown | requestMic() reject TypeError | insecure | insecure screen |
| denied | permission `change` → granted/prompt | granted/prompt | **auto-clear gate → "ready, tap to start"** |
| granted | recognition error not-allowed/service-not-allowed | denied | reset gate (covers OS-level revoke mid-session) |
| any | user closes dialog | (unchanged) | persist last known state in ref |

### 2.4 The two non-negotiable implementation rules

1. **Gesture preservation.** The tap handler reads the **cached** state
   synchronously (a ref, never an `await`) and, if a request is needed, calls
   `getUserMedia` immediately — no awaited work before it. Permission *queries*
   happen on mount/visibility, never inside the tap.
2. **Grant once, reuse.** The in-gesture `getUserMedia` grant satisfies the
   later `SpeechRecognition.start()` (which fires *after* the spoken prompt, i.e.
   outside any gesture). This grant is the **bridge** between "the tap" and "the
   recognizer three seconds later."

---

## 3. SUBSYSTEM SPEC

### 3.1 STT — Speech-to-text

- **Engine:** Web Speech `SpeechRecognition` / `webkitSpeechRecognition`.
- **Config:** `lang="en-US"`, `interimResults=true` (live words),
  `maxAlternatives=1`, `continuous=false` (one utterance per turn).
- **Lifecycle per turn:** start → onresult (accumulate final + interim) →
  onend/onerror → resolve transcript. Always resolve exactly once.
- **Errors:** `no-speech`/`aborted` = benign (return what we have);
  `not-allowed`/`service-not-allowed` = permission → flip state to denied;
  `network` = Chrome's cloud unreachable (VPN/offline) → surface honestly;
  `audio-capture` = device lost.
- **Barge-in policy (decided):** sequential, **not** concurrent. Speak the
  prompt fully, *then* open the mic. Concurrent mic+TTS causes speaker echo to be
  transcribed (the desktop "feedback loop"). The green/red buttons + Mute give
  the user the "skip her" control without the echo risk.
- **Prompt-word filtering:** strip the prompt's own words from the transcript as
  a safety net against any residual echo.
- **Future swap:** on-device Whisper implements the *same* `listen(): Promise<string>`
  interface behind the same gate. (Deferred; needs a real device to validate.)

### 3.2 TTS — Text-to-speech

- **Engine:** `speechSynthesis` + `SpeechSynthesisUtterance`.
- **Voice selection:** prefer Natural/Neural/Google/Siri/Aria/Jenny/Samantha;
  user-pickable + remembered (localStorage). Rate adjustable (~1.0–1.2×).
- **iOS gotchas:** (a) `getVoices()` is empty until `voiceschanged`; (b) the
  first utterance must follow a user gesture to unlock audio — so we fire a
  silent/short warm utterance on the first tap; (c) speech can be interrupted by
  ringer/silent switch.
- **Mute:** silences TTS for the session (resets on tab-away). Recognition still
  works muted (clean barge-in path).

### 3.3 Permission — covered by §2. Lives in `src/lib/voice-mic.ts`.

### 3.4 Conversation engine (slot filling) — REUSED, unchanged in behavior

Three short spoken parts → editable review → verbal Save → another-entry loop:
- **Part 1:** case/client + hourly rate (bare-number rate parsing; matter
  resolution with fuzzy match + candidate picker + tap-or-say).
- **Part 2:** date + hours + category (decimal/tenths/fraction hour parsing;
  natural date parsing).
- **Part 3:** activity note (light legal-vocab cleanup).
- Each part: green **Correct** / red **Incorrect** + spoken yes/no.
- Final: spoken **"Save?"** (green Save / red Edit) → persist.
- Then **"Another entry?"** → **"Same case?"** (keeps case+rate).
- The whole form is **editable on screen the entire time** — voice never traps
  the user; they can type any field and tap Save.

---

## 4. PER-GROUP WORKFLOWS (what the human experiences)

### GROUP A — Chromium (Android/desktop Chrome, Edge, Samsung)

- **granted:** tap mic → records immediately. Zero friction, ever.
- **prompt:** tap mic → **native Allow popup** → records. (Exactly like Zoom.)
- **denied:** one calm screen: "Microphone is off for this site — one-time fix,"
  with the **exact** path for this device, **plus a live watcher**: the instant
  the user flips it in settings, the screen turns to "Microphone is on — Start,"
  **no reload**. This is the part that has been missing.

### GROUP B — Safari (iPhone/iPad/Mac)

- Can't pre-check. tap mic → request in gesture → popup (if allowed) → records.
- On reject: show the iOS/macOS reset path + a **Try again** button (no live
  watcher on Safari, so manual re-check).
- **iOS standalone gate:** if installed PWA on iOS < 16.4, detect and tell them
  to use Safari proper (or update iOS).
- Warm the TTS on first tap (gesture unlock).

### GROUP C — Firefox / non-Safari iOS

- No pretending. One line: "Voice typing isn't supported in this browser. Use
  **Chrome, Edge, or Safari** — or just type the entry below." The typed form is
  fully functional. (Optionally: a "copy link to open in Chrome" affordance.)

---

## 5. ERROR TAXONOMY (every error, one handler)

| Source | Error | Meaning | UX |
|--------|-------|---------|----|
| getUserMedia | NotAllowedError / SecurityError | blocked/embargoed | denied gate + watcher |
| getUserMedia | NotFoundError / DevicesNotFoundError | no mic hardware | "no microphone" screen |
| getUserMedia | NotReadableError / TrackStartError | mic busy (other app) | toast + Try again |
| getUserMedia | TypeError | getUserMedia missing → not https | insecure screen |
| getUserMedia | AbortError / other | rare hardware/OS | raw name + Try again |
| SpeechRecognition | not-allowed / service-not-allowed | permission | flip to denied gate |
| SpeechRecognition | network | cloud unreachable (Chrome) | "no connection to the voice service" |
| SpeechRecognition | no-speech / aborted | silence/cancel | benign, continue |
| SpeechRecognition | audio-capture | device lost mid-session | "lost the microphone" + Try again |
| Permissions.query | throws | API absent (Safari) | treat as unknown, proceed |
| speechSynthesis | not speaking | voices not loaded / iOS lock | warm-up utterance; show text anyway |

**Diagnostics panel** (always one tap away) prints: `device` (browser·OS·install),
`engine` (group + recognition yes/no), `permission` (state), `secure`, and the
last raw error. `permission: denied` is *proof* of a device block, not a bug —
this ends arguments factually.

---

## 6. FILE / MODULE ARCHITECTURE (3.0 only)

```
src/lib/platform.ts                 [exists]  UA → {os, browser, mobile, label} + reset steps
src/lib/voice-mic.ts                [exists]  the permission state machine (engineGroup, query,
                                              watch, requestMic, classify, guidance)
src/lib/voice/                       [NEW, refactor target]
  ├─ stt.ts                          recognition engine: listen(): Promise<string>, errors
  ├─ tts.ts                          synthesis: speak(), voice picker, iOS warm-up
  ├─ parse.ts                        all parsers (hours, rate, date, category, matter match)
  └─ conversation.ts                 the slot-filling orchestrator (parts, confirm, save loop)
src/components/admin/VoiceTimeEntry3.tsx  [exists]  the UI shell + gate; wires the libs
src/app/admin/(panel)/time-tracker-3/page.tsx [exists] route; same DB/CSV via <TimeTracker>
src/components/admin/TimeTracker.tsx [shared, untouched] takes VoiceComponent prop
```

> Current 3.0 has the permission machine in `voice-mic.ts` and everything else
> inlined in `VoiceTimeEntry3.tsx`. The plan's `src/lib/voice/*` split is a
> **cleanliness milestone** (Phase 5), not a correctness requirement — the inline
> version is already functionally complete.

---

## 7. DATA FLOW (unchanged, stated for completeness)

Voice/typed input → `TimeEntryInput` `{matter, entryDate, note, price(rate),
quantity(hours), activityUserName, nonBillable}` → server action `addTimeEntry`
→ Postgres (`timeEntries`, owned by the logged-in user) → board re-renders.
Same table as 1.0/2.0. Saving requires a connection; recognition does not (cloud
STT aside). CSV import/export format is byte-identical across all three.

---

## 8. BUILD PHASES & MILESTONES

- **Phase 0 — Permission machine (DONE):** `voice-mic.ts` + gate UI in 3.0.
  Acceptance: diagnostics shows the true `permission:` state; denied auto-recovers.
- **Phase 1 — Group coverage hardening:** explicit `insecure`/`no-device`/
  `unsupported` screens; Safari (Group B) request-then-classify path; Group C
  typed-only screen with browser guidance.
- **Phase 2 — iOS specifics:** TTS warm-up on first tap; voices `voiceschanged`
  handling; iOS-standalone-<16.4 detection + message.
- **Phase 3 — Recognition robustness:** network-error copy; sequential
  speak-then-listen; prompt-word filtering; abort on cancel/buttons.
- **Phase 4 — Conversation polish:** confirm the parts/verbal-save/another-entry
  loop behave identically to 2.0; editable-form-always escape hatch.
- **Phase 5 — Refactor to `src/lib/voice/*`:** extract stt/tts/parse/conversation
  for testability (pure functions get unit tests for parsers).
- **Phase 6 — Diagnostics & telemetry:** the details panel; optional opt-in
  logging of `{group, permission, error}` to help remote debugging.
- **Phase 7 — (Deferred) On-device Whisper:** slot a local `listen()` behind the
  same gate, validated on a real device, with a download/progress UX and a
  clean fallback to cloud STT.

---

## 9. ACCEPTANCE CRITERIA (per group — how we know it's done)

**Group A:**
- Fresh profile, permission `prompt`: tap mic → native popup → Allow → full
  entry by voice end-to-end, then saved to the board.
- Profile with permission `denied`: gate shows correct reset path; after the
  user flips the setting, the gate **auto-recovers without reload**.
- Diagnostics always reflect the true state.

**Group B (Safari iOS/macOS):**
- First tap → popup → Allow → voice works; voices speak (after warm-up).
- Reject → correct iOS/macOS reset copy + Try again.
- iOS<16.4 standalone → clear "use Safari" message.

**Group C (Firefox / iOS-non-Safari):**
- No false promises; typed form fully works; correct "use Chrome/Edge/Safari"
  guidance.

**All groups:**
- The typed form is usable at all times regardless of mic state.
- Saving writes to the same DB; CSV unchanged; 1.0/2.0 untouched.

---

## 10. TESTING MATRIX (how to verify without guessing)

| Device | Browser | Test | Pass = |
|--------|---------|------|--------|
| Android tablet/phone | Chrome | Incognito (fresh) → tap mic | native popup → Allow → voice runs |
| Android | Chrome | normal profile w/ block → reset in settings | gate auto-flips to "on", no reload |
| Android | Samsung Internet | tap mic | popup → voice |
| iPhone | Safari | tap mic | popup → voice + spoken prompts |
| iPhone | Safari installed PWA (iOS≥16.4) | tap mic | popup → voice |
| iPhone | Chrome (WebKit) | open | "use Safari" message; typed form works |
| Mac | Safari | tap mic | popup → voice |
| Mac/Win | Chrome/Edge | tap mic | popup → voice; OS-level reset copy if blocked |
| Any | Firefox | open | "unsupported, use Chrome/Edge/Safari"; typed form works |

**The Incognito test is the universal truth-teller:** it removes the device's
stored permission/embargo so we can tell "device state" from "code bug" in 30
seconds, on any platform.

---

## 11. WHAT THIS DELIBERATELY DOES NOT TRY TO DO

- It does **not** try to bypass a `denied` permission (impossible by browser
  law). It detects it, guides the exact fix, and auto-recovers.
- It does **not** require an installed app — install is an *enhancement*
  (fullscreen + persistent permission), not a prerequisite.
- It does **not** send audio anywhere except the browser's chosen STT service
  (Google/Apple/Azure per browser). On-device STT is the Phase 7 privacy option.
- It does **not** touch Time Tracker 1.0 or 2.0.
```
