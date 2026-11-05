# Copy trim-start tolerance outcome (#121)

On 2026-11-06, Chromium **151.0.7922.34** and Mediabunny **1.65.2** completed
78 paired artifact trials and three actual editor flows. Retain production's
preferred copying, expanded copy regions, and `shiftTolerance: 0`. Do not add a
finite `boundaryTolerance` or blanket transcoding. This is a measured no-change
policy outcome under ADR-0015/0017/0021/0024, after prerequisite #117.

A finite tolerance constrains deviation of the **copied start region**, not the
presented trim end. MP4/MOV can hide encoded preroll with edit lists. A zero
copy-start tolerance forced video transcoding in the tested copyable ranges;
that improved these VFR endpoints but did not eliminate the independently
encoded Generated audio mix tail. A finite 50 ms tolerance still copied the
near-keyframe VFR case with the same unverified end. The present best-effort
contract does not justify paying the measured re-encode cost for every such
range or representing this option as a general precision solution.

The controlling upstream contract is [ConversionCopyOptions in Mediabunny
1.65.2](https://github.com/Vanilagy/mediabunny/blob/v1.65.2/src/conversion.ts#L384-L423).
No shrink policy, strategy picker, forced-copy mode or smart renderer was added.
The unchanged runner remains the only product runner.

## Evidence and method

[Reproduction commands and measurement definitions](../../verification/copy-boundaries/README.md)
include fixture recipes, external-tool prerequisites and observer limits.
[Compact artifact evidence](evidence/copy-boundaries-2026-11-06.json) retains
fixture hashes, source and output endpoint identities/intervals, normal versus
raw packet metadata, encoder-call counts, processing times, decoded A/V events,
range classifications and resulting Export reviews. Full frame/packet arrays
remain reproducible in ignored `tmp/copy-boundaries/evidence.json`.
[Live editor evidence](evidence/copy-boundaries-app-2026-11-06.json) records
explicit delivery, invalidation and re-import/playback.

Two eight-second fixtures use AVC long GOPs with B frames: CFR at 60 fps and VFR
with retained 60 Hz ticks but variable 16.667/33.333 ms spacing. Each decoded
frame carries a unique binary luminance identity; independent source decoding
confirms 480/360 unique frames. Periodic flashes and independently decoded AAC
bursts establish source event offsets. All variants reuse identical bytes,
Selection, output settings and included track. Fresh pages isolate observers;
the second repetition reverses policy order. The candidate changes exactly one
served copy-options object, leaving production files unchanged.

All five output containers complete compatible video-plus-mixed-audio exports.
MP4/MOV use copied AVC under defaults; MKV/MPEG-TS transcode these negative-start
copy regions with zero shift; WebM uses VP8/Opus and necessarily transcodes this
AVC source. This does not establish all source-codec/container permutations or
that non-edit-list containers always transcode. Encoder calls, rather than
matching codec names, establish the observed strategies. Audio encoding remains
independent in every included-track case; the six No audio controls omit audio
and issue no audio encoder calls.

## Measured boundaries

Deltas below use the first source-frame PTS for start quantization and the final
source-frame PTS plus its actual output duration for the mapped end. They are
frame-quantized observations, not sub-frame content guarantees. Positive means
later than the requested boundary. Duration alone is never used as boundary
proof. The existing classifier uses the asset's nominal 16.667 ms tolerance.

| Fixture / Selection / output | Default start / mapped end | 50 ms tolerance | Zero tolerance |
| --- | --- | --- | --- |
| CFR `[1.137,5.283)` MP4/MOV | +13 / +0.334 ms; copied | −3.667 / +0.004 ms; encoded | −3.667 / +0.004 ms; encoded |
| VFR `[2.137,6.283)` MP4/MOV | +13 / +33.667 ms; copied | −3.667 / +0.003 ms; encoded | −3.667 / +0.003 ms; encoded |
| VFR `[5.013,7.283)` MP4/MOV | +20.333 / +33.667 ms; copied | Same boundaries; copied | −13 / +0.003 ms; encoded |

The artifact harness now accepts a measurement callback and passes this real
video boundary evidence into its existing classifier and Export review planner.
CFR MP4/MOV default reports Boundaries verified **within tolerance**; VFR copied
cases remain Best effort / Boundaries unverified. Unavailable interval evidence
stays unverified; measurement errors are explicit failures. These reports apply
to individual measured artifacts. The normal product has no fixture evidence
and continues to show Boundaries unverified, including in all three live flows.
No measurement is persisted as a profile-wide guarantee.

The near-keyframe VFR case illustrates why endpoints must be separated:

- Last copied identity is tick 438 at source PTS 7.300 s, whose **source coverage**
  runs to 7.333333 s: +50.333 ms beyond requested end.
- That frame's **output duration** is only 16.667 ms. Its mapped end is
  7.316667 s: +33.667 ms. Copy's output video ends at 2.283334 s, 13.334 ms longer
  than requested 2.270 s. These three numbers answer different questions.
- Zero tolerance encodes and ends output video at 2.270 s, using source identity
  435. It still retains approximately 32.667 ms of decoded PCM tail: generated
  audio lasts 2.302667 s for **all three** policies.
- Chromium native duration is 2.316667 s for copy and 2.302667 s for zero. Native
  last-image identity is the final video image held through the audio tail;
  this is not evidence that video itself lasts to native duration.

The main VFR MPEG-TS transcode ends its mapped final video interval 16.333 ms
early; finite copy-start tolerances do not change it. This reinforces retaining
best-effort product language rather than promising exact ends after encoding.

## Preroll, A/V and processing cost

CFR MP4 default contains 317 video packets, including 69 with negative PTS and
two additional negative-DTS-only reorder packets after normal edit-list
projection. Disabling edit lists exposes the retained earlier frames. Normal
presentation begins at source identity 69 (1.150 s); Chromium and ffmpeg agree.
Negative DTS alone is reorder evidence, not visible preroll. The encoded region
and the visible range are separate records.

Chromium endpoint seeks agree with independent decoded first/last identities in
all **54** MP4/MOV/WebM trials. Native MKV/MPEG-TS playback is not claimed; their
frames, packet timelines and PCM are independently inspected with ffmpeg.
None of these endpoint seeks proves physical playback timing or final image
hold duration by itself.

All included-audio trials retain source flash/click event identity. Added A/V
onset difference relative to the independently decoded source remains within
20.334 ms (40 ms regression budget). Copied off-keyframe MP4/MOV adds about
−13 ms because its visible first-frame/timestamp projection differs from the
independently zero-based mix; near-keyframe copied VFR adds about −20.333 ms.
Transcodes are within roughly 0.05 ms for these decoded events. This is signal
artifact evidence, not speaker/display or universal sync proof.

Median production-runner milliseconds across two ordered repetitions:

| Main range | Default | 50 ms | Zero |
| --- | ---: | ---: | ---: |
| CFR MP4 | 123.7 | 750.2 | 474.9 |
| CFR MOV | 125.1 | 441.8 | 458.0 |
| VFR MP4 | 122.3 | 378.0 | 361.2 |
| VFR MOV | 147.0 | 381.9 | 392.7 |

Small fixtures, runtime scheduling and two repetitions limit throughput claims.
These are production-runner wall times including mix preparation and muxing,
excluding source import analysis, native endpoint checks and ffmpeg inspection.
The candidate's copyable CFR paths encode 250 video frames versus zero under
defaults; main VFR paths encode 167 versus zero. Near-keyframe VFR encodes 92
only under zero tolerance. Other containers already encode and show no material
boundary change from adjusting this copy-start option.

## Verification and remaining limits

`npm run typecheck`, `npm run test`, `npm run build`, verification TypeScript,
affected source lint/format and verification Biome checks pass. The suite has
671 tests, including ten signal/interval analysis regressions and five new
harness evidence/failure cases. The production build retains its existing large
chunk warning. No gate is disabled or weakened.

Actual editor flows exercise CFR, VFR and No audio import, playback, transport
and keyboard Selection, conservative Export review, export, explicit Download
export, independent artifact inspection, Selection invalidation, Close file,
and delivered-artifact re-import/playback. No development server was started.

Unknown final sample intervals intentionally produce no boundary evidence.
Fixture reports are video-boundary evidence; generated audio endpoints and
container/native duration are reported separately. The proof covers one
supported Chromium build and compatible synthetic outputs, not every VFR
pattern, codec, hardware encoder, runtime or malformed source. A future precision
contract would need an explicit endpoint policy for both video and mixed audio
and broader presented-boundary fixtures; tightening copy start alone cannot
establish that contract. No additional issue is implemented or closed here.
