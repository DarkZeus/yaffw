# Output-aware Preview synchronization evaluation

Issue [#113](https://github.com/DarkZeus/yaffw/issues/113), under parent
[#110](https://github.com/DarkZeus/yaffw/issues/110), evaluates the candidate
against [#112's fixed measurement procedure](../../verification/preview-av-alignment/README.md).

**Output correction remains disabled.** Browser measurements estimate presentation;
without calibrated physical paired measurements they cannot satisfy the enablement
gate. This evaluation does not establish physical speaker/display alignment.

## Implementation boundaries

The Preview audio engine exposes separate rendering and presentation reads.
`getCurrentTime()` remains the scheduling clock. The separately tested output
mapper projects `getOutputTimestamp()` context/performance pairs through the exact
source scheduling epoch and Playback speed. It never subtracts another latency
value or interprets the difference from `currentTime` as device latency.

Video following and the visible Playhead consume the same presentation time.
Native video retains the existing hard-resync tolerance (the larger of 250 ms or
two source frames); changing that control policy was not bundled into the timestamp
candidate. Small offsets can therefore remain visible even with the mapper active.
This limitation is part of the evaluated candidate, not proof of precise alignment.

Missing, zero, nonfinite, stale, future, or discontinuous timestamp pairs fall back
to rendering time. A pair is stale after 250 ms; the mapper permits 20 ms future
clock tolerance and rejects changes over 100 ms in the context/performance mapping.
These are conservative validity limits, not measurements of device latency.
Within a playback epoch presentation cannot move backwards or ahead of rendering.
After fallback, presentation can hold briefly until output catches up. A new source
epoch resets that history. Seek, pause/resume, buffering, interruption/recovery,
rate changes and source replacement cannot reuse an old scheduling epoch.

Selection entry, source clipping, wrap commands and media end remain governed by
rendering time. At a loop boundary the scheduler has rendered the half-open range,
and the transport seeks to the Selection start once, using the existing bounded
window preparation. Already rendered output can still be draining through the
device: no additional output-drain delay is introduced. Video/Playhead switch to
the new epoch at that command. At media end they show the duration and pause only
when rendering reaches the duration. This preserves source boundaries and avoids
truncating scheduled PCM to compensate for visual delay; it does not promise
physically seamless loop presentation on buffered outputs.

Explicit pause retains the visible frame, and ordinary Play resumes from that
visible position, as before. With output timing enabled that can replay the interval
between the last visible frame and the frozen rendering position. Explicit seeks
remain authoritative; interruption recovery uses the engine's retained position.
There are no changes to Selection storage, Audio mix decisions, export inputs,
source decoding, scheduler lookahead, gain transitions, or cleanup ownership.

Live loop verification exposed an existing observer-ordering defect: preparing a
seek published `buffering` before installing the new scheduler position. The video
follower consequently received the old endpoint between two seeks to the loop
start and could remain stuck seeking. The same failure reproduced with the parent
transport. Preparation now installs the new generation before notifying buffering
observers. A regression test failed before this ordering fix and passed afterward;
the identical browser reproduction then continued decoding across wraps.

`PREVIEW_OUTPUT_TIMING_ENABLED` is a checked-in false constant, with no user setting,
URL switch, or persisted preference. Deterministic engine tests opt in explicitly.
The browser comparison changes only that module's served constant in an isolated
browser context, records its original/candidate hashes, and otherwise runs the
actual application's audio engine, video, controls and media. Production source
is never rewritten to turn the candidate on.

## ADR reconciliation

| Record | Classification | Evidence and action |
| --- | --- | --- |
| ADR-0004 | Current | Mapper and scheduling remain plain TypeScript; no core React dependency. Preserve. |
| ADR-0005 | Current | Existing engine and transport boundaries own the change; no mediator. Preserve. |
| ADR-0008 | Current | Preview-only code stays in editor-next; export/core dependencies unchanged. Preserve. |
| ADR-0009 | Current | Behavioral tests cover the clock boundary; core regressions remain in the full suite. Preserve. |
| ADR-0011 | Current | Volatile presentation state remains in Preview adapters. Preserve. |
| ADR-0012 / ADR-0014 | Current | Explicit seek/frame-step and Selection commands remain authoritative. Preserve. |
| ADR-0013 | Current | Native video remains a muted audio-clock follower; native fallback stays explicit. Preserve. |
| ADR-0015 / ADR-0017 | Current | Half-open media-time Selection and export precision are unchanged. Preserve. |
| ADR-0016 / ADR-0018 | Current | Optional output timestamps fall back within the supported runtime. Preserve. |
| ADR-0021 / ADR-0022 | Current | Audio mix/export and graph metering are untouched. Preserve. |
| ADR-0023 | Current | Bounded scheduler owns audio time; production output correction stays disabled. Preserve. |

No material ADR decision changes: the candidate is not enabled. Future enablement
requires the predeclared physical improvement/non-regression gate and reconciliation
of the final presentation/loop semantics.

## Automated verification

- `npm run typecheck`: passed the repository's editor-next TypeScript boundary.
- `npm run test`: 72 files, 521 tests passed, including mapper validity/rates,
  real engine scheduling equivalence, buffering/seek/recovery, visible-frame resume,
  transport wrap/end behavior, existing native fallback, export and cleanup tests.
- `npm run build`: passed; the existing bundle-size advisory is nonfatal.
- Affected-source Biome and verification-directory Biome: passed with inherited
  repository rules; no rules or exclusions changed.
- `pnpm exec react-doctor --staged --blocking warning --no-score`: passed, 16 staged
  source files, no issues. The comparison against HEAD also reported no new issues.
- Fixture validation: passed, unchanged SHA-256
  `bb4ab356f4807237faad19d8b86f79d5450e9648289c7e57c9e8a2131ef00f7a`, nine decoded
  events within the predeclared 1 ms source-alignment gate.

Additional broad checks remain non-green outside the affected scope:
`npm run check` reports 35 existing errors, and
`pnpm exec tsc --project tsconfig.json --noEmit` reports the standalone
`prototypes/nle/workbench.tsx:136` obsolete `isPlaying` transport prop. Both were
reproduced from an untouched archive of parent `d7ca8a1`; the required scoped
TypeScript/build checks and all affected-file checks pass. This issue does not
change the prototype or repair unrelated baseline formatting.

## Actual-app and scheduling verification

[Actual-app evidence](./evidence/preview-output-functional-2026-09-19.json) records
seven checks in each of production, candidate, and candidate with unavailable
output timestamps. All passed in Chromium 151.0.7922.34 using default autoplay
policy and real controls: playback at 0.5×/1×/2×, pause, seek/frame steps, three
Selection [2,8] wraps at 2×, native context suspension/recovery, media end, and
asset close/replacement. Wrap spacing was approximately 3.03–3.07 seconds; every
context closed and no page errors occurred. The two-track functional fixture is
separate from the single-track alignment fixture.

[Candidate scheduling evidence](./evidence/preview-output-bounded-2026-09-19.json)
passes all 12 existing production functional operations and all ten bounded
scheduling gates over five 30-second trials, including 250/500/1000 ms renderer
stalls. Median readiness was 8.5 ms (p95 12.5 ms); peak retained PCM was 1,687,552
bytes (1.61 MiB); all trials had zero underruns and natural timer p95 about
11.1 ms. Selection clipping produced zero meter peaks beyond the endpoint and
the control-plane wrap took 14 ms, within the unchanged 100 ms gate. Cleanup
released all retained PCM, sources, timers, generations and contexts. This uses
the reproducible 40-second two-track fixture from #111 and preserves the numerical
gates; it is not a repeat of #109's historical fixture comparison.

## Paired alignment evaluation

The [final raw comparison](./evidence/preview-output-comparison-2026-09-19.json)
ran 2026-09-19 15:52:13–15:58:16 UTC with source frozen and no concurrent build,
tests or other verification browsers. It contains five alternating-order pairs
at each rate: all 30 trials, 270/270 events and 15/15 pairs qualified. No page
errors occurred; every trial released its context. Recorded source SHA-256 hashes
matched before/after the run and were independently checked against final source.

Values below are milliseconds. Positive signed error means audio later than
video. Each signed value is the median of five trial medians; parenthesized
values are between-trial sample standard deviations. Improvement is the median
of paired reductions in absolute error, not the difference of group medians.

| Speed | Baseline signed median (SD) | Candidate signed median (SD) | Paired absolute improvement median (SD) | Maximum per-trial browser budget, baseline/candidate |
| --- | ---: | ---: | ---: | ---: |
| 0.5× | +136.79 (107.50) | −58.76 (5.21) | +78.36 (48.89) | 49.67 / 49.67 |
| 1× | −20.91 (62.79) | −4.01 (7.75) | +18.42 (39.94) | 54.02 / 54.12 |
| 2× | −22.67 (6.94) | −26.39 (9.77) | −3.72 (15.43) | 35.37 / 35.37 |

Candidate absolute error increased in 2/5 pairs at 0.5×, 1/5 at 1×, and 4/5 at
2×. Baseline variability is substantial. Browser budgets describe timestamp and
frame observations, not calibrated physical uncertainty or confidence intervals.
The raw report retains every event, per-trial budget, signed/absolute range,
paired difference, configuration and intervention hash. These estimates do not
establish a consistent benefit or low-latency physical non-regression.

Configuration: headed Chromium 151.0.7922.34, Darwin 24.5 arm64, 1440×1000 browser
viewport, 48 kHz audio contexts. OS inventory reported AirPods as default Bluetooth
output and built-in MacBook Air speakers as default system output; the browser's
physical sink was not independently verified. The built-in display is 2560×1664
Retina; refresh and physical presentation timing were unverified. There was no
calibrated microphone/photodiode capture, route switching, or separate verified
built-in/wired versus Bluetooth physical trial. Physical uncertainty is unknown.

The [earlier exploratory comparison](./evidence/preview-output-comparison-exploratory-2026-09-19.json)
is retained separately: its opening trials overlapped automated checks, and it
predates the loop notification fix. It qualified all 15 pairs with 269/270 events
(one rejected flash). It is not substituted for the final frozen-source run.

**Decision: inconclusive physical result; correction stays disabled.** The issue
explicitly allows this outcome. Future enablement needs repeatable calibrated
improvement where baseline error is meaningful, low-latency non-regression within
measured uncertainty, and preserved seek/loop gates. This report claims successful
implementation/evaluation and preserved functional gates, not successful physical
synchronization improvement.
