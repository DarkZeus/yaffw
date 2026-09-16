# Preview audiovisual alignment baseline

2026-09-16 · [#112](https://github.com/DarkZeus/yaffw/issues/112) · parent
[#110](https://github.com/DarkZeus/yaffw/issues/110)

The repeatable browser measurement path is complete. **Physical speaker/display
alignment remains unmeasured, and there is no evidence here to enable output-time
correction.** Production timing, scheduling, Selection clipping, and export are
unchanged. ADR-0013 and ADR-0023 retain their current semantics.

## Recorded baseline

The [machine-readable evidence](./evidence/preview-av-alignment-2026-09-16.json)
contains all 15 trials and each event's signed estimate, raw click/flash timing,
local output timestamp pairs, visual bracket, and rejection reason. The
[rerunnable procedure](../../verification/preview-av-alignment/README.md) defines
the fixture, calculation, coverage gates, screening budget, physical capture
procedure, and baseline/candidate gate for #113.

Configuration: headed Chromium 151.0.7922.34, Darwin 24.5.0 arm64, live application
at `127.0.0.1:3000`, production source revision
`669696bf1121f2d9c7b6acc1a292521fab24071d`. OS inventory reported built-in MacBook
Air Speakers, stereo 48 kHz, and the built-in display at 60 Hz. Chromium's viewport
was 1440×1000. The browser's physical sink was not independently captured.
No server was started and no application assets were intercepted.

Each row summarizes **five independent trial medians**, not 45 independent
samples. Positive means audio later than video; negative means audio earlier.
The known fixture onset bias is removed at each Playback speed.

| Playback speed | Median signed estimate | Between-trial SD | Range of trial medians | Largest observation budget | Accepted events |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.5× | −35.35 ms | 1.92 ms | −37.17 to −33.19 ms | ±49.67 ms | 45/45 |
| 1× | +12.28 ms | 5.15 ms | +2.47 to +16.02 ms | ±54.17 ms | 44/45 |
| 2× | −9.42 ms | 6.42 ms | −18.92 to −2.82 ms | ±35.32 ms | 45/45 |

Every trial met the predeclared minimum of seven usable events; every speed
completed five qualified trials. Of 134 accepted events, 83 had an observed first
flash frame and 51 used a bounded onset interval. One flash was not observed
(1×, first trial, event 2) and is explicitly rejected. At 2×, all 45 observations
were bracketed; a 50 fps source exceeds the display's 60 Hz cadence. The budget
includes those brackets instead of assigning the first later frame an exact
onset. No rate's median exceeded its browser observation budget.

The maximum measured PCM scan cost was 0.5 ms per scheduled chunk. Instrumentation
still has an observer effect, including canvas readback and callback work; the
budget is a conservative diagnostic bound, not calibrated absolute accuracy.
Expected display timestamps do not measure light emitted by the screen, and
source PCM plus output timestamps do not measure sound at the listener.

## Physical limitations and candidate decision

- Built-in/wired: the OS default was built-in speakers; no calibrated
  microphone/photodiode recording was available. This is browser evidence under
  that OS configuration, not a passing physical alignment trial.
- Bluetooth: no connected Bluetooth output was reported, and no calibrated
  Bluetooth capture was available. No Bluetooth pass is claimed.
- Physical uncertainty and meaningful physical baseline offset are **unknown**.
  Repeatability does not remove unknown sensor, output-device, or display delay.
- No synchronization candidate was implemented or compared. #113 must retain
  existing production timing unless its fixed comparison gate is met. This
  baseline does not establish an audible synchronization defect.

The [physical result template](../../verification/preview-av-alignment/physical-result-template.json)
preserves unknown fields as `null` and starts as `unmeasured`. Calibrated paired
baseline/candidate captures, low-latency non-regression, and seek/loop/end checks
are required before enabling correction. Missing hardware is explicitly an
inconclusive outcome, not a reason to infer a pass.

## Implementation and verification

Verification code is isolated in `verification/preview-av-alignment/`; production
does not import it. The fixture validator independently decodes pixel content,
frame PTS, and PCM. Its SHA-256 manifest ties measurements to the existing asset;
an optional generator can produce and validate an equivalent replacement without
overwriting it. The observer delegates native source scheduling and reads the
actual muted video. Analysis, collection, trial reporting, and browser operation
have separate small modules.

The exploratory pilot identified skipped onset callbacks and the need to wait
for Audio readiness before choosing Playback speed. These shaped the documented
measurement procedure before the recorded baseline. No candidate data was used
to tune the acceptance gate.

Passed:

- `node verification/preview-av-alignment/fixture-validation.mjs`: nine decoded
  synchronized events; fixture offset +0.0208–0.0625 ms, within the 1 ms gate.
- `npm run typecheck` and `pnpm exec tsc --project tsconfig.json --noEmit`:
  production and full verification TypeScript boundaries.
- `npm run test`: 69 files, 468 tests, including 22 new measurement tests and
  existing transport, loop, bounded-window, cleanup, and export regressions.
- `npm run build`: successful; existing bundle-size advisory remains nonfatal.
- Scoped Biome using the verification config: all new code, manifest, template,
  and evidence. The config inherits repository rules and extends file coverage
  to verification files; it does not disable any rule.
- Headed live browser: five imports per speed, real Audio readiness and controls,
  play to 9.5 s, actual source-rate and muted-native-video assertions, pause,
  Close file, and context closure on all 15 trials; no page errors.

Tests cover known positive/negative offsets and speed scaling, weak click
detection, chunk-spanning events, cancellation and zero-duration boundaries,
invalid/stale/discontinuous timestamps, skipped visual onsets, malformed visual
timelines, missing evidence, and enforcement of the five-trial coverage gate.
Independent review findings were resolved before this baseline and final checks.
