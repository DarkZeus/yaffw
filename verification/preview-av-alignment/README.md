# Preview audiovisual alignment measurement

Issue [#112](https://github.com/DarkZeus/yaffw/issues/112), parent
[#110](https://github.com/DarkZeus/yaffw/issues/110). This directory is a
verification tool, never imported by production. It establishes a baseline for
#113; it does not implement or enable output-time correction.

## Run

Use the user's existing application at `http://127.0.0.1:3000`. These commands
do not start a server. Node, the repository dependencies, FFmpeg/ffprobe, and
an available Playwright installation plus Chromium are required. FFmpeg is an
offline fixture verification dependency, not an application dependency.

```sh
node verification/preview-av-alignment/fixture-validation.mjs
npm run test -- verification/preview-av-alignment/tests
pnpm exec biome check --config-path=verification/preview-av-alignment verification/preview-av-alignment
YAFFW_HEADED=1 node verification/preview-av-alignment/browser-check.mjs
```

If Playwright is outside normal Node resolution, set `YAFFW_PLAYWRIGHT_PATH` to
its absolute module directory. Set `YAFFW_BROWSER_EXECUTABLE` to the installed
Chromium executable when needed. Set `YAFFW_OUTPUT_DESCRIPTION` and
`YAFFW_DISPLAY_DESCRIPTION` to verified configuration descriptions; an omitted
description remains explicitly unverified. Headed Chromium is preferred for
display observations. Default headless runs must remain labeled headless.

The baseline and comparison runners share `prepare.mjs` for fixture hash checks,
observer/report bundling, and run settings. Trial collection and each runner's
coverage assertions remain in their respective entry points.

The runner opens disposable browser contexts, imports the fixture through the
actual file input, waits for the Audio master meter to be ready, sets Playback
speed and Preview volume, uses the real Play button, measures to 9.5 seconds,
pauses, and uses Close file. It verifies the audio context closes after every
trial. No autoplay bypass, media mocks, intercepted app assets, or engine
replacement is used. Waiting for Audio readiness matters: changing speed while
the engine is still being constructed does not establish a stable baseline.

Five independent imports at each of 0.5×, 1×, and 2× alternate rate order.
Keep the test window visible, avoid other CPU/GPU work, and retain every trial.
Allow about four minutes. Results go to `/tmp/yaffw-112-browser.json`, or
`YAFFW_BROWSER_RESULT_PATH`. `/tmp/yaffw-112-last-capture.json` retains the latest
raw capture for debugging. The durable result retains each click, observed
flash, timing bracket, local output pairs, and rejection reason.

`YAFFW_AV_PILOT=1` runs one repetition per speed for setup diagnosis. Pilot
results are explicitly labeled and cannot pass the five-trial baseline gate.
`YAFFW_AV_REPETITIONS` overrides the count; a non-pilot run with fewer than five
qualified trials at any speed exits unsuccessfully while still writing evidence.

## Fixture provenance and independent validation

The committed fixture is `public/export-correctness-fixtures/sync-flash-click.mp4`:
10 seconds, H.264 at 50 fps, stereo AAC at 48 kHz, nine flashes/clicks at 1–9 s.
`fixture-manifest.json` records its SHA-256 and independently decoded event
times. `fixture-validation.mjs` checks decoded pixel transitions and PCM threshold
crossings against actual frame PTS; it does not infer alignment from metadata
alone. It rejects missing events and an audio/visual discrepancy over 1 ms.

The source click amplitude increases over the fixture. A 0.02 threshold misses
early clicks; the verified threshold is 0.005. Carrier crossings within 50 ms
are grouped into one burst. Click threshold crossings lag flash PTS by
0.0208–0.0625 ms; the measured per-event bias is retained and removed only from
the separately reported presentation-path estimate. Audio sample resolution is
0.0208 ms; source frame interval is 20 ms. Decoder/threshold variation is covered
by the 1 ms fixture allowance, not assumed to be physically exact.

To regenerate an equivalent stimulus without overwriting the committed fixture:

```sh
node verification/preview-av-alignment/fixture-generate.mjs /tmp/new-sync-fixture.mp4
```

The recipe generates raw flash frames and 1 kHz burst samples, encodes them, and
independently validates the resulting file. It does not promise byte identity
across encoder versions. Using another fixture requires reviewing its decoded
signals, replacing the asset deliberately, and regenerating its manifest with
`fixture-validation.mjs --write`; old evidence remains tied to its old hash.

## What the browser measures

The injected observer delegates native source start/stop unchanged and scans
the actual scheduled PCM after `start()`. It retains burst timings, not PCM.
Start offset, duration, rate, stop/disconnect, and chunk boundaries constrain
which bursts could play. A click scheduled more than one 128-frame render
quantum late invalidates the trial. Silent initial chunks may be late without
moving an observed click. Default included Track volume and Preview volume are
100%, with native video muted; the observer does not hear the post-graph output.

For each actual click, nearby advancing `getOutputTimestamp()` pairs estimate
its performance-clock output time:

`audioPerformanceMs = pair.performanceTime + 1000 × (clickContextTime − pair.contextTime)`

Pairs must be finite and nonzero, within 100 ms of the click context time, and
no more than 250 ms old at collection. At least two distinct context timestamps
must agree within 5 ms. Missing, stale, or discontinuous pairs reject the event.
No `baseLatency`/`outputLatency` correction is added. Those values are metadata;
`currentTime − timestamp.contextTime` is never treated as device latency.
This follows the [Web Audio output timestamp mapping](https://webaudio.github.io/web-audio-api/#dom-audiocontext-getoutputtimestamp).

`requestVideoFrameCallback` supplies frame media PTS and `expectedDisplayTime`.
Drawing that native video frame to a one-pixel canvas confirms its bright/dark
content. An observed first flash frame provides the browser's expected onset.
If its callback was skipped, onset is interval-censored between the previous
dark frame and first observed bright frame; the midpoint is reported with the
half-width explicitly included in uncertainty. The first bright frame is never
silently substituted for a missed onset. Brackets wider than 100 ms, missing
flashes, reversed/nonfinite timestamps, and insufficient coverage are rejected.
This is especially relevant when 2× makes the 50 fps source exceed 60 Hz.
The [video frame callback specification](https://wicg.github.io/video-rvfc/)
describes expected presentation, not a physical display sensor reading.

Positive signed offset means **audio later than video**. Each event records:

- `rawOffsetMs = audioPerformanceMs − visualMidpointMs`.
- `pathOffsetMs = rawOffsetMs − fixtureOffsetMs / playbackRate`.
- The raw click, flash metadata, visual interval, and local timestamp pairs.

Each trial reports event mean/median/range/sample standard deviation, exact
versus bracketed onset counts, exclusions, and observer scan cost. Across
trials, statistics use trial medians; events from one run are not treated as
independent trials. Per-event order is retained so drift is inspectable.

## Gates fixed before the recorded baseline

The browser coverage gate requires five qualified trials per speed, each with
at least seven of nine events. Its conservative observation screening budget is:

`Ubrowser = 20 ms / rate + 128000 / contextSampleRate + 5 ms + 1 ms / rate + largest visual bracket half-width`

The terms cover source frame granularity, one audio render quantum, timestamp
mapping spread allowance, fixture allowance, and skipped-callback uncertainty.
This is a screening budget, **not a calibrated confidence interval**. A trial
median inside it does not establish a meaningful browser offset. Repeatability
is reported separately. Unknown downstream speaker/display delays are not zero;
physical uncertainty remains `null`, and the browser result cannot authorize
enabling output correction even when its median exceeds this budget.

For #113, preserve this fixture, hash, rates, thresholds, and result schema.
Collect at least five paired baseline/candidate trials in alternating order for
each verified output route, with at least seven events per trial. Keep signed
offsets, absolute offsets, dispersion, missing events, and configuration for both.
Do not discard unfavorable trials or retune thresholds after seeing a candidate.

For physical evidence, let `U` be the conservative calibrated measurement bound
below and `s` the sample standard deviation of trial medians. A baseline is
meaningful only if `abs(median) > U + 2s`. Where that baseline is meaningful,
require all paired trials to improve
absolute error and the median improvement to exceed `Ubaseline + Ucandidate +
2 × SD(paired improvements)`. On low-latency output, no paired trial may regress
by more than the combined uncertainty. Unknown calibration or unavailable output
routes are inconclusive, never passing trials. Browser estimates are supporting
diagnostics, not substitutes for that physical gate.

Also rerun the repository's native transport and bounded-window tests, plus
the live [seek/frame-step/Selection-loop procedure](../../docs/preview-sync-regression.md).
Require zero newly introduced seek/loop/end failures; preserve exact source
clipping and the existing 100 ms loop control-plane budget. Full typecheck,
tests, and build remain required. Timing correction stays disabled when benefit
or non-regression cannot be established.

## Physical speaker/display procedure

`physical-result-template.json` is deliberately unmeasured. Never fill missing
measurements with browser timing or zeros.

1. Record OS/browser versions, actual output route (built-in/wired or Bluetooth),
   device model/profile, sample rate, display resolution/refresh, and fixture
   hash. Repeat separately after changing route and allowing it to settle.
2. Use a photodiode over the flashing Preview aperture and a microphone at the
   stated listening position, captured through two channels of the **same**
   recorder/sample clock. Preserve the raw recording and its hash. A high-speed
   camera with audio is usable only if its own A/V skew is independently
   calibrated; an ordinary screen recording is not physical evidence.
3. Calibrate differential sensor/recorder delay with a reference of known
   timing, retain the calibration recording and method, and record its offset
   and uncertainty. Unknown sensor or recorder skew makes the trial inconclusive.
   Do not subtract microphone distance unless the declared measurement target is
   speaker emission rather than the listening position; preserve the choice.
4. Import through actual Preview, wait for audio readiness, use unchanged
   default audio decisions, and run at 0.5×/1×/2×. Capture five independent runs
   per configuration. Use known event order to associate nine flashes/clicks.
   Identify photodiode onset and audio burst onset with fixed, documented
   thresholds; retain sample indices, raw times, and every rejected event.
5. Compute `correctedOffsetMs = audioOnsetMs − visualOnsetMs − calibrationOffsetMs
   − fixtureOffsetMs / rate`. Add absolute calibration, sampling, onset-detection,
   and fixture uncertainty bounds conservatively; document each term. Report
   each trial's median/range/SD and between-trial SD of medians. Unknown terms
   must remain unknown rather than producing a numeric pass.
6. Apply the fixed comparison gate above. If Bluetooth or calibrated capture is
   unavailable, say so explicitly. This limitation is an allowed outcome of
   #112, not evidence that those configurations pass.

## #113 paired candidate comparison

`browser-comparison.mjs` retains the #112 collector, fixture, event report schema,
thresholds and uncertainty budget unchanged. It runs five paired independent
imports at each speed, reversing both rate order and baseline/candidate order on
alternate repetitions (30 trials). Use the same verified output route and keep
the window visible. Do not edit the application while collecting evidence.

```sh
YAFFW_HEADED=1 YAFFW_PLAYWRIGHT_PATH=/Users/fuad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node verification/preview-av-alignment/browser-comparison.mjs
```

The existing server must already be running at `127.0.0.1:3000`. No server is
started. The sole application intervention is the Vite module
`/src/editor-next/audio/engine/preview-output-timing-enabled.ts`: its disabled
export is delivered unchanged for baseline and changed from `false` to `true`
for candidate. Each trial records the URL and original/delivered SHA-256. No
other asset is replaced. The runner records per-trial UTC start/end times and a
SHA-256 snapshot of every source file, rejecting a run whose source changes
during collection. This measures the actual candidate through native
Preview controls; it does not simulate timestamp pairs or replace the engine.

Results default to `/tmp/yaffw-113-comparison.json`; the same output-path,
configuration, repetition and pilot environment variables apply. Failures are
retained, with raw capture when available, and do not count as qualified pairs.
A pair requires both members from the same repetition and rate to meet #112
coverage. Duplicated, missing, failed or invalid members cannot qualify. The
summary retains signed and absolute trial-median statistics, paired absolute
improvement (positive means improvement), combined browser budget, and every
pair including unfavorable outcomes. Per-event signed offsets, exclusions and
raw timing stay in the original trial reports. A failed coverage gate exits
unsuccessfully after saving the evidence; pilot evidence cannot authorize release.

Browser comparisons are diagnostic only. Without separately calibrated physical
paired captures and verified output routes, physical uncertainty stays `null`,
the physical gate is inconclusive, and candidate enablement remains false even
if all browser offsets improve. Apply the unchanged physical gate above before
considering production enablement.
