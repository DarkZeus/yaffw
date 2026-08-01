# Single-pass mixed-audio export investigation

This note records the issue #105 prototype and adopt/reject decision under
ADR-0015, ADR-0017, ADR-0018, ADR-0021, and ADR-0024. Production export behavior
is unchanged by the investigation.

## Decision

Adopt composable Mediabunny `Conversion` in a separate production follow-up.
The prototype preserves the current Generated media artifact while removing the
intermediate video-only Blob, its second `Input`, and the encoded-video packet
copy pass. The representative warmed Chromium measurement was 481.85 ms for the
candidate versus 530.8 ms for the current path. The short fixture does not
justify a general performance claim, but the lifecycle and intermediate-memory
reduction are architectural improvements independent of that timing result.

## Representative browser measurement

The checked-in `sync-flash-click-two-audio.mp4` fixture is a 66,748-byte,
10-second MP4 with one 160×90 H.264 video track and two AAC audio tracks. It
duplicates the known sync-click track so the default Audio mix must combine two
included Media tracks into one Generated audio mix. The measured half-open
Selection was `[2,000,000us, 8,000,000us)`.

The standalone investigation page warmed both paths, then ran two alternating
trials per path and recorded the median runner time. It also ran the current
video-only stage separately to measure the otherwise private intermediate
artifact.

| Measurement | Current two-stage path | Composable candidate |
| --- | ---: | ---: |
| Wall-clock runner time | 530.8 ms | 481.85 ms |
| Outputs | 2 | 1 |
| Video pipeline passes | 2 | 1 |
| Intermediate video-only bytes | 9,228 | 0 |
| Final Generated media bytes | 18,642 | 18,642 |
| Container/codecs | MP4 / H.264 / AAC | MP4 / H.264 / AAC |
| Video dimensions | 160×90 | 160×90 |
| Video Selection duration | 6,000,000 us | 6,000,000 us |
| Generated audio tracks | 1 | 1 |
| A/V first-timestamp difference | 0 us | 0 us |
| A/V end-timestamp difference | 80,000 us | 80,000 us |
| Delivery action performed | No | No |

Both paths report a 6,080,000 us container/audio duration because AAC encoder
padding extends the Generated audio mix 80,000 us beyond the exact 6,000,000 us
video Selection. The candidate matches the current path; it neither introduces
nor fixes that existing limitation.

Signal-level inspection sampled the known flash/click events at output media
times 1.05, 2.05, 3.05, 4.05, and 5.05 seconds. Both artifacts produced white
video frames with mean luma 255 at every sample and matching audio peaks between
0.03 and 0.05. Combined with identical start/end timestamp relationships, this
validates representative A/V synchronization rather than relying on track
inventory alone.

Generated media bytes were captured and inspected before delivery. Download was
not invoked because it remains a separate explicit Delivery action.

## Resource ownership

The prototype calls `Conversion.init({ composable: true })`, allowing Conversion
to add and drive the video track without owning the Output lifecycle.

| Resource | Owner and normal lifecycle | Abort or failure cleanup |
| --- | --- | --- |
| Mediabunny `Input` | Prototype creates it from the source Blob; disposable scope disposes it after the artifact is captured. | Disposable scope disposes it. |
| `Conversion` | Prototype initializes and executes it; it drives only video and is marked settled after `execute()` resolves. | Prototype cancels it while execution is unsettled. |
| `AudioBufferSource` | Prototype adds it to the same Output, adds the rendered Generated audio mix in parallel with Conversion, then closes it. | Disposable scope closes it exactly once. |
| `Output` | Prototype creates it; after all tracks are registered, the prototype starts it. After Conversion and audio source completion, the prototype finalizes it. | Prototype cancels it until finalization succeeds. |
| `BufferTarget` | Output writes the sole final artifact into it; the prototype reads it only after finalization. | Output cancellation releases encoder and muxer resources; the target is then collectible. |
| Rendered `AudioBuffer` | `renderBrowserAudioMix` creates it before Output work; Web Audio exposes no explicit disposal API. | It becomes collectible after the Export job settles. |

Automated failure injection covers Export cancellation, Conversion execution
failure, audio-source failure, and Output finalization failure. Each case checks
Conversion/Output cancellation as applicable, AudioBufferSource closure, and
Input disposal. Success checks exactly one source `BlobSource`, one Output,
one start/finalize pair, and no cancellation.

## Compatibility and measurement limits

- Verified with Mediabunny 1.52.2 in the user-owned Chromium/WebCodecs runtime
  at `127.0.0.1:3000`, matching ADR-0018. Other browser engines and non-default
  documented output profiles were not measured.
- Page JavaScript exposes no trustworthy per-operation peak-memory API.
  `measureUserAgentSpecificMemory()` and heap snapshots are point-in-time
  measurements, so no peak-memory number is claimed. Removing the 9,228-byte
  intermediate artifact and one complete Output/Input pipeline is directly
  observable; real savings on larger assets still need profiling.
- The 10-second, 160×90 fixture is suitable for repeatable correctness and
  lifecycle proof, not throughput extrapolation to long or high-resolution
  Media assets.
- Composable Conversion is valid even when it utilizes zero video tracks. The
  production follow-up must reject a discarded/missing video track explicitly
  instead of allowing an accidental audio-only artifact.
- The standalone HTML entry is a source-only investigation surface. It is not a
  product route and is not imported by the application.

## Smallest production follow-up

Replace the current mixed-audio branch inside `default-export-runner.ts` with
the proven shared-Output orchestration. Keep the existing direct video-only
path for an all-excluded Audio mix, preserve Output settings and progress
semantics, and reject a composable conversion that does not utilize the expected
video track. Then remove the obsolete intermediate-Blob demux/remux helpers and
their encoded-packet copying dependencies.

Regression coverage should move the prototype lifecycle cases to the production
runner boundary, retain all-excluded and zero-volume Audio mix cases, cover
documented container/codec/quality choices, and run this two-audio fixture
through the real Chromium artifact harness for Selection duration, signal-level
A/V synchronization, cancellation, failure cleanup, and explicit Generated
media delivery separation.
