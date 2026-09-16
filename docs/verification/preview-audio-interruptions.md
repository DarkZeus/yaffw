# Preview audio interruption recovery — #111

[Issue #111](https://github.com/DarkZeus/yaffw/issues/111), under
[parent #110](https://github.com/DarkZeus/yaffw/issues/110), adds AudioContext
lifecycle coordination without changing the bounded PCM scheduler contract or
export decisions.

## Ownership and behavior

The context lifecycle helper owns state observation and cancellable resume
results. The existing window controller owns latest playback intent, decode
generations, frozen media time, and recovery preparation. Its playback state
(`paused`, `playing`, `buffering`, `interrupted`, `recovery-required`, `closed`)
is separate from decoded-track readiness, so interruption never activates an
independent native clock or disables mix edits.

A suspended/interrupted context stops sources and pulls, invalidates pending
windows, and freezes the audio clock. At most one automatic resume is attempted
per interruption; a rejected or pending request exposes **Resume audio**.
Explicit recovery can supersede a pending browser promise. Running-state
recovery re-primes at the latest requested media time and speed. Pause, frame
stepping, scrubbing, Close file, replacement, and teardown cancel older intent.
Closed contexts are terminal and are never resumed or closed twice. Disposal
removes listeners before closing the owned context.

Transport subscribes to actual engine playback: the muted native follower
pauses during interruptions/preparation and restarts only when audio is playing.
The transport preserves Selection entry through interruptions, retains source
clipping at the Selection end, and clears playback intent at media end. Reaching media end also supersedes any
unsettled follower seek from an earlier loop; a late native event cannot restore
that obsolete loop target.

Live testing exposed a Vidstack 1.15.6 pause/seek race: its HTML provider can
ignore the native pause event when a simultaneous seek drops `readyState` to
HAVE_METADATA. The player store then still says playing, so the player's guarded
`play()` returns without starting native playback. The focused media transport
adapter uses the public provider `play()`/`pause()` methods; normal media events
still update the viewer. A regression test models the stale store, and the
actual app exercises interruption → seek → speed → recovery.

## Browser evidence

[Application evidence](./evidence/preview-audio-interruptions-2026-09-16.json)
was recorded against the user's existing `127.0.0.1:3000` server in headless
Chromium 151 on macOS. No development server was started. The checked-in
10-second two-track synchronized fixture was imported through the actual file
input, and controls were clicked through the running workbench.

Real `AudioContext.suspend()` freezes native video. Controlled resume rejection
and delayed promises verify the recovery action, lack of retry loops, later
pause winning, latest seek/speed, and disposal. Explicit `interrupted` reporting
is injected, not a claim that an OS interruption occurred. Context closure,
Close file confirmation, listener cleanup, replacement, recovery near the
Selection end, continued loop playback, and stopping at media end are exercised.

OS sleep, exclusive-device takeover, physical output changes, and mobile Safari
were not tested. These limitations do not replace the deterministic state/race
coverage and must not be described as passing hardware tests.

## Bounded-window regression evidence

The existing production functional checks and numerical continuity, memory,
readiness, node churn, and cleanup gates are rerun using a newly generated
40-second two-stereo-AAC continuous fixture. Its hash and metadata are recorded
in the evidence. The historical #109 controlled fixture is not available here;
this is a regression run with unchanged thresholds, not a new historical
baseline comparison. Five independent 30-second trials inject 250, 500, and
1,000 ms renderer stalls at seconds 4, 10, and 18.

All 12 functional checks and all five trial gates passed: median readiness
10.8 ms, p95 16.9 ms, peak retained PCM 1,687,552 bytes, zero underruns, natural
timer p95 11.1 ms, and zero residual sources/PCM/timers after cleanup.

See [bounded evidence](./evidence/preview-audio-interruptions-bounded-2026-09-16.json)
and [reproduction instructions](../../verification/preview-audio-interruptions/README.md).

## Repository verification

`npm run typecheck`, `npm run test` (494 tests across 70 files),
`npm run build`, and changed-file `npx biome check` pass.
The build retains its existing large-chunk advisory. Deterministic tests cover context transitions, missing interrupted
reporting, rejected/deferred resume, pause/seek/rate races, closed contexts,
replacement/disposal, follower ownership, fallback, Selection looping, and end.
Export tests remain part of the complete suite; no export implementation changes.

The repository-wide `npm run check` is not clean: an untouched archive
of starting revision `172d90b` also reports 35 Biome errors in existing shared UI
and configuration files. The working tree additionally contains inaccessible
pre-existing `.tanstack/tmp` entries. All changed TypeScript files pass Biome;
no check configuration, exclusion, or rule was changed.
