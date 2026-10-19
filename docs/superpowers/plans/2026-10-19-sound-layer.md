# Sound Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live color tones, left/center/right spatial audio and change-only narration to Hear the Color.

**Architecture:** Pure image-analysis functions (`colorSense.ts`) feed a Web Audio engine (`tones.ts`); `useVisionLoop` drives both from a ~100 ms sampling timer, ducks tones around speech, and skips/adjusts `/api/see` calls based on frame change. The backend gains an optional `previous` request field and a `changed` response flag, both backward compatible.

**Tech Stack:** Vite + React 18 + TypeScript, Web Audio API, Vitest (new dev dependency, for pure logic only); Flask + pytest in `../PP-AI-Service`.

**Spec:** `docs/superpowers/specs/2026-10-19-sound-layer-design.md`

## Global Constraints

- No new runtime dependencies (Web Audio API only); Vitest is a dev dependency.
- Backend changes only in `../PP-AI-Service/ai_svc/see/`, backward compatible: no `previous` means today's behavior and response shape.
- The sequential loop guarantee stays: descriptions never overlap, requests never pile up.
- Zones are equal thirds of the width, full height. Sampling grid about 32x32, never the 768 px upload frame.
- Ducking: tones drop to 15% over about 150 ms, return over about 300 ms; un-duck in a `finally` and on Stop/unmount.
- Change detection reference = last *successfully described* frame; forced refresh after 45 s without a description in a describing mode.
- `previous` = last substantive description (a reply with `changed: true` or no `changed` field), never an acknowledgement. Reply with `changed: false` is neither spoken nor captioned.
- Modes: `describe` | `both` (default) | `tones`. Stored under `localStorage` key `htc.soundMode`. `tones` mode makes no `/api/see` calls and no speech.
- Explanation line: spoken once per device in `describe`/`both` modes (flag `htc.toneIntroSeen`); caption only in `tones` mode. Strings in en, zh, es, fr, ja.
- Sampling/Web Audio failure is a silent no-op; no new status messages.
- Existing accessibility rules in `docs/DESIGN.md` apply (native controls, translated labels).
- Neutral threshold: saturation below 0.15. Tone master gain at most 0.15.

## Review Focus

- Camera not ready (`readyState < 2`, zero size): sampling returns null; no tone update, no crash.
- Pure black / pure white / uniform gray frames: zones read as neutral, tones near-silent, no NaN pitch.
- Stop pressed mid-speech while ducked: tones stop and gain is reset; nothing stays ducked on next Start.
- Mode switched live (`tones` to `both`, `both` to `describe`) while a request is in flight: no duplicate speech, tones start/stop immediately.
- Old backend ignoring `previous` (no `changed` field), and a failed request: reference frame is not reset, reply is treated as a normal description.

---

### Task 1: Test runner and `colorSense.ts`

**Files:**
- Modify: `package.json` (add `vitest` dev dependency and `"test": "vitest run"`)
- Create: `src/lib/colorSense.ts`
- Test: `src/lib/colorSense.test.ts`

**Interfaces:**
- Produces:
  - `interface Zone { hue: number; saturation: number; brightness: number }` (hue 0-360, others 0-1)
  - `interface Zones { left: Zone; center: Zone; right: Zone }`
  - `analyzePixels(rgba: Uint8ClampedArray, width: number, height: number): Zones` (pure)
  - `sampleZones(video: HTMLVideoElement): Zones | null` (draws to a reused 32x32 canvas; null if no frame)
  - `frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number` (mean absolute RGB difference, 0-1; 1 if lengths differ)
  - `NEUTRAL_SATURATION = 0.15`

- [ ] **Step 1: Install Vitest and add the `test` script.** Run: `npm install -D vitest` then add the script. Expected: `npm test` runs and reports no test files.
- [ ] **Step 2: Write failing tests** in `colorSense.test.ts`:
  - `analyzePixels` on a 3x1 image `[red, green, blue]` gives `left.hue` near 0, `center.hue` near 120, `right.hue` near 240, saturation 1.
  - uniform gray gives saturation below `NEUTRAL_SATURATION` in all zones, brightness near 0.5.
  - all-black and all-white give brightness 0 and 1, finite hue (no NaN).
  - hue is the dominant bin, not a mean: a zone of 60% red (hue 5) and 40% red (hue 355) reports a hue within 15 of 0/360, not 180.
  - `frameDifference` of identical arrays is 0; black vs white is 1; different lengths is 1.
- [ ] **Step 3: Run tests, verify they fail** (`npm test`, expect import/not-defined failures).
- [ ] **Step 4: Implement the functions in `colorSense.ts`.** Hue from a 12-bin histogram weighted by saturation, taking the bin center of the heaviest bin; brightness and saturation are zone averages (HSV).
- [ ] **Step 5: Run tests, verify they pass.**
- [ ] **Step 6: Commit** `feat: add color analysis helpers and test runner`.

### Task 2: Mode storage and `tones.ts` engine

**Files:**
- Create: `src/lib/soundMode.ts`, `src/lib/tones.ts`
- Test: `src/lib/soundMode.test.ts`, `src/lib/tones.test.ts`

**Interfaces:**
- Consumes: `Zone`, `Zones`, `NEUTRAL_SATURATION` from Task 1.
- Produces:
  - `type SoundMode = 'describe' | 'both' | 'tones'`; `SOUND_DEFAULT: SoundMode = 'both'`
  - `loadSoundMode(): SoundMode`, `saveSoundMode(m: SoundMode): void` (try/catch like `voices.ts`; invalid stored values fall back to default)
  - `hueToFrequency(hue: number): number` (pure; one octave from 220 Hz to 440 Hz over 0-360 on a pentatonic set; neutral handled by the caller)
  - `zoneToTone(z: Zone): { frequency: number; gain: number }` (pure; neutral zones give 110 Hz and gain at most 0.01; otherwise gain = brightness x 0.15 / 3)
  - `unlockTones(): void` (call synchronously in the Start tap), `startTones()`, `updateTones(z: Zones)`, `duck(on: boolean)`, `stopTones()`

- [ ] **Step 1: Write failing tests:** `loadSoundMode` returns `'both'` when storage is empty, invalid, or throws; round-trips a saved value. `hueToFrequency` is monotonic non-decreasing, stays within 220-440 and returns finite values for 0, 359.9, 360 and negative input (wraps). `zoneToTone` returns 110 Hz and gain at most 0.01 for saturation 0.1; for black (brightness 0) gain is 0; sum of three max gains does not exceed 0.15.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `soundMode.ts` and the pure functions in `tones.ts`.**
- [ ] **Step 4: Implement the engine in `tones.ts`:** one shared `AudioContext`; three sine oscillators, each through a gain and a `StereoPannerNode` (pan -1, 0, 1) into a master gain. Use `setTargetAtTime` ramps (about 80 ms) for frequency and gain. `duck(true)` ramps master to 15% over 150 ms, `duck(false)` back over 300 ms. `stopTones()` closes oscillators, resets ducking and is safe to call twice. If `AudioContext` is missing or throws, every function is a no-op.
- [ ] **Step 5: Run tests, verify pass.** Engine nodes are verified by hand in Task 4; unit tests cover the pure parts only.
- [ ] **Step 6: Commit** `feat: add sound mode storage and Web Audio tone engine`.

### Task 3: Wire tones into the loop, UI and i18n

**Files:**
- Create: `src/components/SoundSelect.tsx`
- Modify: `src/hooks/useVisionLoop.ts`, `src/App.tsx`, `src/lib/i18n.ts`

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces:
  - `useVisionLoop` option `soundMode: SoundMode`; read through a ref so a live switch applies without restarting the camera.
  - i18n keys `soundLabel`, `soundDescribe`, `soundBoth`, `soundTones`, `toneIntro` in all five languages.
  - `SoundSelect({ value, onChange })`: native `<select>` styled like `VoiceSelect`, `aria-label={t.soundLabel}`.

- [ ] **Step 1: Add the i18n keys** (en, zh, es, fr, ja). `toneIntro` is one short sentence: pitch is color, volume is brightness, left/right is where it is.
- [ ] **Step 2: Implement `SoundSelect.tsx`; render it in `App.tsx` next to `VoiceSelect`; persist with `saveSoundMode`.** Call `unlockTones()` in the Start tap handler next to `unlockSpeech()`.
- [ ] **Step 3: In `useVisionLoop`, add the sampling timer (100 ms) while running and mode is not `describe`:** `sampleZones` then `updateTones`; `startTones()` on start, `stopTones()` on cleanup and when the mode becomes `describe`.
- [ ] **Step 4: Duck around speech:** `duck(true)` before `speak()`, `duck(false)` in a `finally`.
- [ ] **Step 5: Tones-only mode:** the loop makes no `describe()` call and no speech; it idles (sleep) and re-checks the mode. Show the intro as a caption (kind `status`).
- [ ] **Step 6: One-time spoken intro** in `describe`/`both` before the first description, gated by `htc.toneIntroSeen` (try/catch storage).
- [ ] **Step 7: `npm run build`** (type check) and fix errors. Expected: success.
- [ ] **Step 8: Commit** `feat: sonify camera colors with spatial tones and a sound mode picker`.

### Task 4: Manual verification of the demo moment

**Files:** none (record findings in the commit message or fix inline).

- [ ] **Step 1:** Run `npm run dev:https`, open on a phone with headphones. Sweep across a red object, then a blue wall: the tone changes pitch smoothly; left/right placement is audible.
- [ ] **Step 2:** Speech stays intelligible over the tones; tones return after each sentence.
- [ ] **Step 3:** Press Stop mid-sentence, then Start again: no stuck low volume, no stray tone.
- [ ] **Step 4:** Switch the mode live through all three; check iOS (ringer on) plays tones and speech together. If they conflict, note it in the PR description (fallback is *Describe only*).
- [ ] **Step 5:** Fix issues found; commit `fix: sound layer tuning` if anything changed.

### Task 5: Backend `previous` and `changed` (PP-AI-Service)

**Files (in `../PP-AI-Service`):**
- Modify: `ai_svc/see/prompts.py`, `ai_svc/see/service.py`, `ai_svc/see/routes.py`, `docs/SEE_API.md`
- Test: `tests/see/` (follow the existing test files there)

**Interfaces:**
- Produces:
  - `get_see_prompt(language: str, previous: str | None = None) -> str` (unchanged output when `previous` is None)
  - `SeeService.describe(image_b64, lang="en") -> str` stays as it is; add `SeeService.describe_change(image_b64: str, lang: str, previous: str) -> tuple[str, bool]` returning `(text, changed)`.
  - `/api/see` accepts optional string `previous` (truncated to 300 chars; non-strings ignored). With a valid `previous` the response also has `"changed": true|false`. Without it the response is unchanged.

- [ ] **Step 1: Write failing tests:** prompt without `previous` equals the old prompt exactly; with `previous` it contains the previous text and the instruction to describe only what is new; a non-string or 10,000-char `previous` is ignored/truncated; response has no `changed` key when `previous` is absent; with `previous` and a model reply starting with the marker `UNCHANGED` the route returns `changed: false` and the `text` without the marker; any other reply returns `changed: true`. With `include_audio`, no TTS call is made when `changed` is false.
- [ ] **Step 2: Run, verify fail** (`pytest tests/see -v`).
- [ ] **Step 3: Implement.** The prompt tells the model to reply exactly `UNCHANGED` when nothing meaningful changed. `previous` is user text, so wrap it in quotes in the prompt and state that it is data, not instructions.
- [ ] **Step 4: Run tests, verify pass; update `docs/SEE_API.md`.**
- [ ] **Step 5: Commit** (in the PP-AI-Service repo) `feat: optional previous description for change-only /api/see`.

### Task 6: Change-only narration in the frontend loop

**Files:**
- Modify: `src/hooks/useVisionLoop.ts`
- Test: `src/lib/changeGate.test.ts`
- Create: `src/lib/changeGate.ts`

**Interfaces:**
- Consumes: `frameDifference` (Task 1); backend contract from Task 5.
- Produces:
  - `CHANGE_THRESHOLD = 0.04`, `FORCE_REFRESH_MS = 45000`
  - `shouldDescribe(diff: number, msSinceLastDescription: number): boolean` (pure)
  - `interface Reply { text: string; changed?: boolean }` and `isSpeakable(r: Reply): boolean` (false only when `changed === false`)

- [ ] **Step 1: Write failing tests:** `shouldDescribe(0.01, 1000)` false; `shouldDescribe(0.05, 1000)` true; `shouldDescribe(0.01, 45000)` true; no previous frame (diff 1) true. `isSpeakable({text:'x'})` true; `{text:'x', changed:true}` true; `{text:'x', changed:false}` false.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `changeGate.ts`.**
- [ ] **Step 4: In the loop:** keep the small sampled pixels of the last described frame and a last-description timestamp. Before calling `describe()`, call `shouldDescribe`; if false, sleep 300 ms and continue (tones keep running). Send `previous` (last substantive text) in the request body. On a successful, speakable reply: speak it, update the reference pixels, timestamp and `previous`. On `changed: false` or a failure: do not update the reference or `previous`.
- [ ] **Step 5: `npm test` and `npm run build`.** Expected: both pass.
- [ ] **Step 6: Commit** `feat: skip unchanged scenes and describe only what changed`.

### Task 7: Docs and release notes

**Files:**
- Modify: `docs/DESIGN.md`, `README.md`

- [ ] **Step 1:** Add a "Sound layer" section to `docs/DESIGN.md` (tones, zones, modes, ducking, change gate, new request/response fields) and one line plus the mode picker to the README feature description. Remove "streaming/continuous video" ambiguity: state that tones are local sampling, no extra uploads.
- [ ] **Step 2: Commit** `docs: describe the sound layer`.

## Self-review notes

- Spec coverage: goals 1-2 (Tasks 1-3), 3 (Tasks 5-6), 4 (Tasks 2-3), 5 (Task 3); builder-check calls are encoded in Global Constraints and Tasks 3, 5, 6.
- Task 5's `describe_change` signature is the one used throughout; the frontend sends `previous` and reads `changed` as specified in Task 6.
- Ship order: Tasks 1-4 are the demo moment and stand alone; Tasks 5-6 follow. The frontend works with an old backend because `changed` is optional.
