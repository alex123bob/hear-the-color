# Sound layer: color sonification, spatial audio, change-only narration

Status: draft for approval. Date: 2026-10-19.

## Intent and why

Hear the Color currently gives one spoken sentence per cycle (model latency plus speaking time, several
seconds). Assistants such as Gemini Live are general-purpose chat tools; they do not narrate continuously, do
not put color first, and are not built for blind users. This feature makes the app distinctive for a company
activity/demo: the user *hears color live* as they sweep the camera, hears *where* it is, and is told only
*what changed*. The moment to aim for: "I have never experienced a phone do this."

## Goals

1. **Color sonification.** Continuous tones, about 10 updates/s, derived from the camera frame in the browser.
   Hue sets pitch, brightness sets loudness, neutral/gray scenes give a low quiet tone.
2. **Spatial audio.** Frame split into left / center / right zones, each with its own tone panned to that side
   (StereoPannerNode). Works best with headphones.
3. **Change-only narration.** Skip the API call when the scene has barely changed; when it has, send the
   previously spoken sentence so the model describes only what is new.
4. **Controls.** A "Sound" mode switch: *Describe only* / *Describe + tones* (default) / *Tones only*.
   Remembered per device in `localStorage`. Mode label and a one-line explanation are translated (en, zh, es,
   fr, ja, like the rest of `i18n.ts`).
5. First Start with tones enabled speaks one short line explaining what the tones mean (translated).

## Non-goals and anti-goals

- No distance estimation (a phone browser has no reliable depth); the sentence may still say "close"/"far".
- No saved personal objects/faces, no accounts, no image storage.
- Anti-goal: tones that fight the voice. A sentence being unintelligible because of the tones is a failure even
  if everything else works. Tones must duck while speech plays.
- Anti-goal: an annoying drone. Silent/neutral scenes must be near-silent, and the tones must be easy to mute.

## Constraints

- Frontend: Vite + React 18 + TypeScript, plain CSS Modules, **no new dependencies** (Web Audio API only).
- Backend changes live only in `../PP-AI-Service` (`ai_svc/see/`), and must be backward compatible: other
  clients that do not send the new field get today's behavior.
- Must not break the existing sequential loop guarantee: descriptions never overlap and requests never pile up.
- iOS: Web Audio must be unlocked inside the Start tap (same pattern as `unlockSpeech()` in `speak.ts`); the
  ringer switch mutes audio there and cannot be worked around.
- Accessibility rules in `docs/DESIGN.md` still apply (56px controls, contrast, native elements, translated
  labels, status text never spoken twice).
- Image analysis at 10 Hz must be cheap: sample a tiny downscaled canvas (for example 32x32 per frame), never
  the 768px upload frame.

## Decided with the product owner

- Build order: tones + spatial first (the demo moment), change-only narration second.
- Default mode is *Describe + tones*, so a first demo shows the feature.
- Frontend-only for tones/spatial; the only backend change is an optional `previous` field.

## Design

### New frontend modules
- `src/lib/colorSense.ts`: pure functions. `sampleZones(video) -> {left, center, right}` where each zone is
  `{hue, saturation, brightness}` (average in a linear-ish space, hue from the dominant bin not a naive mean).
  Also `frameDifference(a, b) -> number` for change detection. Unit-testable without a browser.
- `src/lib/tones.ts`: Web Audio engine. `unlockTones()` (call in the Start tap), `startTones()`,
  `updateTones(zones)`, `duck(on)`, `stopTones()`. Three oscillators through gain + stereo panner nodes into a
  master gain. Parameter changes use short ramps (`setTargetAtTime`) to avoid clicks.
- `src/lib/soundMode.ts`: load/save the mode, mirrors `voices.ts`.
- `src/components/SoundSelect.tsx`: mode picker next to `VoiceSelect`, same styling.

### Changes to existing code
- `useVisionLoop`: run a sampling timer (about 100 ms) while running and mode includes tones; call
  `duck(true)` just before `speak()` and `duck(false)` after. In the describe loop, compute the difference
  against the frame last described; below threshold, skip the request and wait briefly instead of calling the
  API. In *Tones only* mode, skip `describe()` entirely. Send `previous` (last spoken sentence) with the request.
  Stop/unmount must stop the timer and tones.
- `App.tsx`: mode state, passes it to the hook; Start tap calls `unlockTones()`.
- `i18n.ts`: strings for the mode labels and the one-time explanation.

### Pitch mapping (starting point, tunable)
Hue 0-360 maps to one octave on a pentatonic-ish scale (so mixed colors sound consonant), warm hues low and
cool hues high. Brightness 0-1 maps to gain 0 to about 0.15 (master). Saturation below about 0.15 treats the zone
as neutral: low fixed pitch, very quiet.

### Backend (PP-AI-Service)
`POST /api/see` accepts optional `previous` (string, truncated to a sane length, treated as untrusted text like
`lang`). When present, the prompt adds: describe only what is new or changed compared to this earlier
description; if nothing meaningful changed, reply with a very short acknowledgement of the same scene. Absent
means unchanged behavior. Document it in `docs/SEE_API.md`.

## Calls made by the designer (from the builder check; not yet confirmed by the product owner)

- **Change detection.** The reference is the *last successfully described* frame, not the previous frame, so slow
  drift accumulates and eventually triggers a description. It resets only after a successful description, never
  after a failed request. A forced refresh happens if nothing was described for 45 s in a describing mode (so the
  app never goes silent forever). While skipping, the user still hears the tones; no speech.
- **`previous` contents.** The last *substantive* description (one the backend flagged as changed), never an
  acknowledgement.
- **Unchanged replies.** With `previous` present the backend returns `{ "text": ..., "changed": true|false }`.
  When `changed` is false the client does not speak or caption it. If the field is absent (old backend, or
  `previous` ignored) the client treats the reply as a normal description, so the frontend can ship before the
  backend. Documented in `docs/SEE_API.md`.
- **Tones only.** No `/api/see` calls and no speech at all. The one-time explanation is shown as a caption only.
  In other modes it is spoken once per device (persisted flag in `localStorage`).
- **Ducking.** Tones drop to about 15% (not silent) over about 150 ms while speech plays, and come back over
  about 300 ms. Un-ducking happens in a `finally` and on Stop/unmount, so it can never get stuck.
- **Live mode switch.** Changing the mode while running takes effect immediately without restarting the camera.
- **iOS.** Web Audio plus speech playing together is verified by hand on a device. Fallback is the user choosing
  *Describe only*; no automatic detection.
- **Unsupported/failed sampling** (no frame yet, tainted canvas, no Web Audio): silent no-op, tones stay off, the
  rest of the app works. No new status message.
- **Zones.** Equal thirds of the width, full height. Neutral threshold as in "Pitch mapping".

## Left to the builder

- Exact thresholds (change detection, neutral saturation), pitch scale, ramp times, sampling grid size.
- Whether the mode picker is a `<select>` or a segmented button group, provided it stays a native, labelled,
  keyboard-reachable control.
- Test approach for `colorSense.ts` (the repo has no test runner yet; adding a minimal one such as Vitest as a
  dev dependency is acceptable).

## Success looks like

Sweeping the phone across a red object then a blue wall produces an audible, distinct, smoothly changing tone
with left/right placement; the spoken sentence stays clear over it; a still scene produces no repeated
descriptions; Stop silences everything immediately.
