# Global Preview gain transitions (#114)

Issue [#114](https://github.com/DarkZeus/yaffw/issues/114), under parent
[#110](https://github.com/DarkZeus/yaffw/issues/110), adds bounded global Preview
volume and mute transitions. Track-level smoothing belongs to #115.

## Contract and duration

The production output graph uses an 8 ms linear ramp while the scheduler is
playing. Each changed target holds the current AudioParam automation, cancels
obsolete endpoints, and anchors a new ramp at the instantaneous gain. Repeated
targets do not postpone completion. Exact zero is a finite endpoint, including
at sample rates where eight milliseconds is not an integer number of samples.

The graph owns automation; the engine supplies playback state and settles the
latest target on pause and re-priming. Disposal cancels automation and disconnects
the graph. New and paused graphs initialize directly. Sources, PCM windows,
channel routing, meter taps, stored preferences, and export inputs retain their
existing owners. No chunk fade or exported fade is added.

The implementation follows the Web Audio
[AudioParam automation contract](https://webaudio.github.io/web-audio-api/#dom-audioparam-cancelandholdattime).
It tracks its own linear segment to anchor subsequent ramps even after a long
constant hold, rather than treating an AudioParam value read as an automation
timeline.

## Rendered evidence

Run the [verification entry](../../verification/preview-gain-transitions/README.md).
The [raw result](./evidence/preview-gain-transitions-2026-09-16.json) was recorded
on macOS with Brave's Chromium 151 headless runtime, using native
`OfflineAudioContext`. Twelve production-helper/graph checks pass, plus three
candidate-duration renders. This is actual Web Audio PCM, not an AudioParam mock.

| Full-scale reference ramp at 48 kHz | Maximum adjacent-sample delta | Endpoint |
| --- | --- | --- |
| 5 ms | 0.004166723 | Exact zero at 5 ms |
| 8 ms | 0.002604247 | Exact zero at 8 ms |
| 10 ms | 0.002083362 | Exact zero at 10 ms |

Eight milliseconds reduces the gain step per sample by about 37.5% relative to
5 ms while completing 2 ms earlier than 10 ms. This is a measured engineering
tradeoff, not a claim that 8 ms is perceptually optimal or inaudible. No
pre-existing audible click defect was reproduced or claimed.

Every rendered sample is compared against an independent expected signal with
absolute tolerance 0.00001; mute silence additionally requires strict zero.
Observed maximum signal error is below 0.0000001. Coverage includes mute/unmute,
nonzero endpoints, overlapping and same-time retargets at 44.1/48 kHz, repeated
targets, late retarget after a constant hold, direct paused initialization,
settling, destruction/recreation, stereo routing, track/global composition, and
continuous adjacent chunks. Under global mute, both track and combined meter
peaks remain `[0.375, 0.125]` while rendered output is zero.

The settle/disposal checks deliberately observe a discontinuity when sources
are synthetically kept connected across those operations. Production stops
sources before settling on pause/re-priming and disconnects on disposal; those
checks validate cancellation, not smooth transport starts/stops.

## Application and lifecycle evidence

The user's development server at `127.0.0.1:3000` was unavailable, and no server
was started. The actual production build was instead loaded in an isolated
Playwright browser using intercepted static-asset responses at that origin.
The production media decoder, audio engine, native video, React controls, and
browser AudioParams ran normally. This verifies the built application, but
does not verify the user's live development-server session or physical audio
hardware.

`verification/preview-gain-transitions/browser-check.cjs` reproduces this path:
import the existing two-audio sync fixture; play; set Preview volume to 40%;
mute; change volume to 70% while remaining silent; unmute to the latest target;
inspect Audio; mute; pause; unmute and set 25% with no new ramp; inspect Export
review; confirm Close file; import again. The old context closes and its pending
automation is cancelled; the new graph initializes without a ramp. All playback
ramps end 8 ms after their command time. No browser errors were observed.

Vitest integration exercises the real transport controls through the player
and monitoring adapter while observing engine targets, immediate control state,
and unchanged Audio mix decisions. Engine regressions cover pause, seek, speed,
routing rebuild, destruction, and replacement. Existing bounded-window,
continuity, cleanup, Selection-loop, and export tests remain green.

## Verification gates

- `npm run typecheck`: pass.
- `npm run test`: 66 files, 443 tests pass.
- `npm run build`: pass, including TypeScript; existing large-chunk warning.
- `npx tsc --project tsconfig.json --noEmit`: pass, including the PCM harness.
- `npm run check -- <five affected production/test TypeScript files>`: pass.
- Harness TypeScript/CJS checked with the same Biome rules via stdin because
  the repository's Biome include list does not cover `verification/`.
- `git diff --check`: pass.

The optional repository-wide `npm run check` diagnostic still reports 35 errors
and local `.tanstack/tmp` permission diagnostics. An untouched archive of base
commit `744e946` independently reproduces all 35 lint/format errors. Affected-file
checks pass; no rule, test, or include list was weakened, and unrelated baseline
formatting was left outside #114.
