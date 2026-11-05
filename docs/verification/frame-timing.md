# Frame timing analysis proof

Recorded on 2026-11-05 against the real local app at
`http://127.0.0.1:3000`, using Mediabunny **1.65.0**, headless Chromium
**151.0.7922.34**, Node **25.9.0**, and ffmpeg/ffprobe **7.1.1**.
The full runtime, fixture hashes, packet summaries and metrics are in
[the analysis evidence](evidence/frame-timing-analysis-2026-11-05.json).

The reproducible [harness](../../verification/frame-timing/README.md) creates
ignored assets under `tmp/frame-timing/`. ffprobe reads every real packet PTS.
Pinned Mediabunny computes bounded metrics independently in Node and Chromium;
those results agree exactly for all six fixtures. The browser then calls the
production local-file analyzer and domain analysis with the actual file bytes.
No metrics or analyzer modules are mocked or intercepted.

| Fixture | Actual packet evidence | Production result |
| --- | --- | --- |
| Fractional CFR | 360 packets, gaps 33.366–33.367 ms | Known underlying 29.97002997002997 fps, constant sample, 33367 μs navigation interval |
| Dropped CFR | 360 packets, gaps 33.333–66.667 ms | Known underlying 30 fps, nonconstant sample, average ≈27.032 fps, 33333 μs interval |
| VFR | 360 packets, gaps 26.482–47.518 ms | Estimated 27.030679821597513 fps, underlying null, 36995 μs interval; measured analysis retained |
| One frame | One packet, no timestamp interval | Estimated 30 fps fallback, analysis null, 33333 μs interval |
| Nonzero start | First PTS 2 seconds, gaps 33.333–33.334 ms | Known underlying 30 fps, constant sample, 33333 μs interval |
| Late variation | 600 packets; first 300 regular, later gaps vary by >20 ms | Bounded sample reports known ≈30.0003 fps and constant; whole-file metrics report underlying null and nonconstant |

Every multi-frame bounded analysis inspected 256 packets. All seven retained
analysis fields match the dependency metrics, and each navigation interval is
`max(1, round(1_000_000 / fps))`. The whole-file comparison inspected every
ffprobe packet. The one-frame case is significant: Mediabunny returns its
1,000,000 Hz time resolution as the best guess with a packet count of one. The
production analyzer rejects that insufficient sample and uses the documented
30 fps fallback rather than treating a time base as a measured frame rate.

Known timing means a confidently inferred underlying rate in the inspected
sample. Dropped-frame CFR can therefore have a known underlying rate and a
nonconstant cadence. A measured VFR estimate retains useful rates and packet
count even though its underlying rate is null. Unavailable analysis is a
separate fallback state. The late-variation case establishes the practical
limit: 256 sampled timestamps cannot guarantee the cadence of the entire file.
The UI must retain its sampled qualification and must not turn those metrics
into a whole-file guarantee.

This proof covers analysis and timestamp semantics for generated H.264 MP4
assets. It does not establish physical playback accuracy, exact visual frame
identity during stepping, B-frame reorder behavior, audio behavior, or other
containers and codecs. Frame actions use the retained duration as an
approximate media-time step. Separate application evidence records the visible
analysis and navigation checks.

## Application verification

The [application evidence](evidence/frame-timing-app-2026-11-05.json) records
26 passing assertions through actual file inputs and workbench controls in the
same Chromium runtime. Each fixture displays its measured/fallback rate and
sampled Analysis facts. Forward/backward nominal frame actions use the retained
duration, clamp at zero and the asset endpoint, and Close file returns to import
without uncaught page errors. The VFR fixture uses a 36995 μs step, rather than
the 33333 μs fallback. Keyboard Selection commands produce displayed boundaries
[1.036, 2.036) seconds, Export review retains Boundaries unverified, and the real runner
produces an artifact that is explicitly downloaded and re-imported successfully.
No export boundary-precision claim follows from that successful round trip.

The nonzero-start MP4 preserves first packet PTS 2 seconds. Chromium normalizes
its native presentation duration to 11.966667 seconds while asset analysis
retains the media-time endpoint 13.966667 seconds. Existing commands remain
bounded by the editor's asset duration; the harness records both values. This
slice does not change native timestamp normalization or introduce adjacent-frame
navigation. Visual review of the VFR panel confirms readable compact facts and
wrapped detailed facts inside the existing scrolling inspector, with the
existing Tailwind tokens and tabular numerals. No motion or styling system is
added.

## Architecture reconciliation

The [Mediabunny metric contract](https://github.com/Vanilagy/mediabunny/blob/v1.65.0/src/input-track.ts#L58-L107)
is translated at the browser adapter boundary into framework-independent
`FrameTimingAnalysis`. A detected underlying rate and constant spacing are
separate facts; a measured estimate retains its non-30 rate, and unavailable
analysis is explicitly null with the established 30 fps fallback. All numeric
consumers retain the shared nominal `frameDurationUs`. There is no persisted
asset/session timing schema; test fixtures are migrated with the model.

Relevant ADR reconciliation found no material drift or requested ADR actions:

```text
0004 | current | analysis data remains plain TypeScript | preserved
0008 | current | browser analyzer translates into the core model | preserved
0009 | current | core/adapter/transport regression coverage | preserved
0011 | current | asset analysis owns facts; UI derives readouts | preserved
0013 | current | stepping remains nominal media-time duration | preserved
0014 | current | boundary commands retain a valid non-empty range | preserved
0015 | current | rate confidence never proves export boundaries | preserved
0017 | current | Selection and Playhead retain integer media time | preserved
```

## Verification gates and integration

The final `npm run test` run passed all 603 tests in 74 files. `npm run
typecheck`, the full `pnpm exec tsc -p tsconfig.json` scope, and the NLE
prototype TypeScript scope pass. Both production and prototype builds pass;
Vite retains its bundle-size advisory. Biome checks pass for every affected
source/test file, the six-file verification directory, and all 24 prototype
code/style files. `git diff --check` passes. The prototype's separate Vitest
command passes 22 tests in five files.

The retained prototype's shell fixture now truthfully represents unmeasured
nominal timing. Its shared transport call also needed the current playback
intent/availability props; the older call failed the documented prototype type
check. Updating that adapter preserves the prototype's playback control path.

One existing export-recovery integration test intermittently sent shortcuts
before React's passive keyboard-listener effect caught up with an immediately
rejected export. Instrumented isolation reproduced suppression in 2 of 60 runs;
awaiting asynchronous `act` around export start settled the rejection and effects,
with all assertions preserved. The fixed isolated stress run passed 614 tests,
including 60 recovery repetitions, followed by the passing full repository run.
No production keyboard/transport workaround or weakened check was introduced.
