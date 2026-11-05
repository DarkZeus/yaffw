# Silent audio ranges in selected-range export

Issue [#119](https://github.com/DarkZeus/yaffw/issues/119), verified 2026-11-06.
This implements the included-track semantics of ADR-0021 within the existing
browser-local export adapter; Preview ownership under ADR-0023 is unchanged.

## Reproduction

The original export decoder rejected every zero-copied-frame result. In real
Chromium this failed a Selection before an included audio track began, after it
ended, and wholly inside its packet gap, including when another included track
was healthy. The failure was `The audio track decoded no presentable samples.`
Source Conversion audio is discarded; upstream empty-audio Conversion behavior
cannot repair this independently decoded Generated audio mix.

Run the committed [harness](../../verification/silent-audio-ranges/README.md)
against the user's existing server, without starting another server. The baseline
runner intercepts only the range decoder with its immutable pre-change source
from commit `855c5ed7ac5d8678943e5a59ae40db517377b218`; it preserves the current
Mediabunny module identity and all remaining production paths. Baseline and
candidate reuse the same fixture rather than regenerating different container
bytes between trials.

Environment: Chromium **155.0.8059.85**, Mediabunny **1.65.2** (manifest and
lockfile; the library's embedded muxer tag still says v1.65.0), ffmpeg/ffprobe.
The six-second H.264/Opus MKV fixture SHA-256 is
`078c2fc13d43c1b33c40d76ddd34f219fb4501a035921b985d2ea5fc59cabc7f`.
It has one sparse mono track and one healthy pulse track. Independent ffprobe
packet bounds exclude the sparse track from each requested half-second Selection.
Mediabunny reports unknown durations for some cluster-ending packets, including
the predecessor of the gap and the final packet, despite ffprobe's 20 ms durations.

## Results

| Selection | Baseline: silent / mixed | Candidate silent RMS | Candidate mixed RMS | Audio minus video pulse onset |
| --- | --- | --- | --- | --- |
| [0.2, 0.7) before audio | failed / failed | 0 | 0.05858 | +10 ms |
| [2.2, 2.7) packet gap | failed / failed | 0 | 0.05952 | +5 ms |
| [5.3, 5.8) after audio | failed / failed | 0 | 0.06399 | 0 ms |

All 12 candidate exports passed. Each included-track case produces one video and
one stereo Opus Generated audio mix (the exercised Output settings use Preserve
source). At each Selection, exclude-all and No audio both produce video without
an audio track, in baseline and candidate. Independent ffmpeg decoding confirms
actual PCM silence or an audible healthy pulse. Video presentation duration is
0.500 seconds; audio/container duration is 0.5135 seconds with codec padding.
The harness allows 60 ms duration drift and 35 ms pulse-alignment drift. The
reported pulse times use 5 ms audio bins and 30 fps video frames, not a physical
playback synchronization measurement or exact-boundary proof.

Actual editor checks cover local-file import, ready Waveform lanes, keyboard
Selection, Start export, explicit Download export, decoded artifact checks,
Selection edits invalidating delivery, Close file, and re-import. Both mixed and
all-included-silent gap exports pass. Source artifacts and unabridged browser
results remain under ignored `tmp/silent-audio-ranges/`; committed recipes,
assertions, the comparison above, and fixture identity retain the reproducible
proof.

## Implementation and failure policy

The range decoder returns its existing Selection-length, source-format zero
buffer only when valid, nonempty packet evidence excludes the Selection. A
preceding unknown-duration or inferred gap-spanning packet is ambiguous: the
adapter decodes from that packet's timestamp and requires positive decoded tail
evidence ending before the Selection. Typical compressed packet duration alone
never proves silence. A packet starting inside the Selection blocks that tail
exception. No speculative default silence or output-track removal is added.

The sample iterator still runs for silent ranges, preserving unsupported decoder
and source/decode failure reporting. Empty metadata, malformed/out-of-order
observed timing, unknown tails without decoded evidence, occupied empty decoding,
and zero-frame samples remain failures. Format changes still fail. The abort
check now runs inside sample ownership's `try/finally`, so a sample delivered
while awaiting cancellation is closed before rejection. The owning mix scope
continues to dispose its Input on success and failure.

Unit regressions cover these proof/failure distinctions, clipping and projected
gaps, channel/rate preservation, multiple included silent tracks, format failure,
sample closure and cancellation. Existing runner/session suites cover cancellation,
export failure, stale jobs, asset replacement, Close file and delivery invalidation.
Browser checks cover actual delivery and re-import in addition to adapter output.

Verification passed: `npm run typecheck`, `npm run test` (649 tests across 75
files), `npm run build`, affected-source Biome checks, harness TypeScript and
Biome checks, and `git diff --check`. The existing Mediabunny upgrade browser
runner also passed all 11 fixtures: long-GOP/sparse-cue video, two-audio click
timing, and continuous/gapped Opus, AAC and Vorbis range/Preview decoding. An
initial concurrent run was interrupted by Vite reloading during documentation
edits; the complete rerun after edits passed. The production build retains its
existing large-chunk advisory, with no build or type errors.

Limits: this proof uses mono Opus input in MKV and MP4 output in one supported
Chromium runtime. Other codec/container/browser combinations and physical A/V
sync are not established. Selected-range exports remain best effort under
ADR-0015/0017; codec padding is not silently removed or described as exact trim
accuracy. Export still allocates Selection-length PCM; this is not a bounded-memory
export change.
