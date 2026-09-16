# Track volume and monitoring transitions (#115)

Issue [#115](https://github.com/DarkZeus/yaffw/issues/115), under parent
[#110](https://github.com/DarkZeus/yaffw/issues/110), extends the verified
[#114 transition contract](./preview-gain-transitions.md) to Track volume,
preview solo, and include/exclude monitoring.

## Implementation

Each track owns one existing gain-transition controller targeting monitoring ×
Track volume gain. During playback, changed targets use an 8 ms linear ramp from
the instantaneous combined gain. Repeated targets do not postpone completion;
interleaved volume and monitoring changes cancel obsolete endpoints. Exact zero
is reached for excluded monitoring and zero volume. Solo of an export-excluded
track retains its remembered Track volume.

The engine supplies playback state. New/paused gains initialize directly; pause,
seek, speed changes, and routing rebuilds settle every gain after stopping old
sources. Disposal cancels automation, and stale engine setters cannot affect a
replacement. Sources and chunk boundaries do not acquire fades or new decoder
work. Stored decisions update immediately and retain the existing squared
percentage-to-gain mapping. Export code and mix semantics are unchanged.

Per-track meters remain after channel routing, volume, and monitoring; combined
meters remain before global Preview volume/mute. They observe the transitioning
signal without applying the volume decision a second time.

## Native signal evidence

The [rerunnable harness](../../verification/preview-gain-transitions/README.md)
uses native Chromium `OfflineAudioContext`, actual production graph code, and
render-quantum suspensions. Each output sample is checked against an independent
signal expectation with absolute tolerance 0.00001; expected silence additionally
requires strict zero.

The [raw PCM evidence](./evidence/track-gain-transitions-2026-09-16.json) records
21 passing scenarios plus three duration references on macOS, Chromium 151.
Maximum sample error is 8.35e-8 (rounded up). Coverage includes rapid interleaved
track/global changes, same-time retargets, exact track silence, six explicit
channel modes, adjacent PCM chunks, simultaneous settle/disposal, and graph
replacement. Existing helper cases cover 44.1 and 48 kHz. Track and combined
meter peaks both reach approximately `[0.6, 0.2]` while global output is exactly
zero. The established 8 ms duration remains unchanged.

The synthetic settle/dispose cases intentionally leave sources present to prove
cancellation; their discontinuities do not represent transport fade guarantees.
Production stops sources before settling and disconnects on disposal.

## Actual application evidence

Initial verification used the production build through isolated Playwright
static-asset interception while the user's server was unavailable. After the
user requested a recheck, `http://127.0.0.1:3000` returned HTTP 200 and the same
checks passed against the live development application with no interception.
No server was started or stopped. Both paths use native media decoding,
AudioContext, React controls, and the existing two-audio synchronized fixture.

The first live attempt clicked Play before the native video had loaded. The
rerunnable script now waits for `video.readyState >= 2` before operating playback;
this synchronizes the harness with media readiness without changing production.
The live native PCM harness also passed all 21 scenarios.

The [built-app evidence](./evidence/track-gain-browser-2026-09-16.json) and
[live browser evidence](./evidence/track-gain-live-browser-2026-09-16.json) record:

- Import and playback at 0.5x, global volume/mute/unmute.
- Both Track volume controls, exclude with remembered volume, volume edits while
  excluded, solo of that excluded track, switching solo, and re-inclusion.
- Channel-routing rebuild followed by another Track volume change.
- Active combined meters while globally muted; immediate paused gain changes.
- Export review, confirmed Close file, cancelled track automation, and a fresh
  import with no inherited ramps.

All 13 observed ramps end 8 ms after their command time. Both track nodes cancel
pending automation and end at zero on Close file. No browser errors occurred.
An independent final rerun of both native PCM and built-app checks also passed.
No physical listening test was performed; this evidence does not claim perceptual
inaudibility or a previously reproduced audible click defect.

## Automated verification and review

- `npm run typecheck`: pass.
- `npm run test`: 66 files / 446 tests pass, including existing bounded-window,
  continuity, memory, cleanup, Selection-loop, and export regression gates.
- `npm run build`: pass; existing bundle-size advisory remains.
- `npx tsc --project tsconfig.json --noEmit`: pass, including the native harness.
- `npm run check --` with the four changed production/test TypeScript files: pass.
- Verification TS/CJS pass the same Biome rules via stdin, with formatter output
  compared to the files (the repository include list excludes `verification/`).
- `git diff --check`: pass.

Two new engine regressions first failed against the old direct gain writes,
then passed with graph-owned track transitions. A controlled Audio panel test
verifies immediate decisions, remembered excluded volume, solo isolation, and
meter semantics. Independent review found no actionable defects. There are no
issue-specific blockers or follow-up changes.
