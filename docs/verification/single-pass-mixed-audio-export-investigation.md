# Single-pass mixed-audio export investigation

This note records the issue #105 investigation, decision, and subsequent
production adoption under ADR-0015, ADR-0017, ADR-0018, ADR-0021, and ADR-0024.

## Decision

Adopted. The default mixed-audio runner now uses composable Mediabunny
`Conversion` and a single shared `Output`. This preserves the Generated media
contract while removing the intermediate video-only Blob, its second `Input`,
and the encoded-video packet-copy pass. The representative warmed Chromium
investigation measured 481.85 ms for the candidate versus 530.8 ms for the old
path. The short fixture does not justify a general performance claim, but the
lifecycle and intermediate-memory reduction are architectural improvements
independent of that timing result.

## Representative browser measurement

The checked-in `sync-flash-click-two-audio.mp4` fixture is a 66,748-byte,
10-second MP4 with one 160×90 H.264 video track and two AAC audio tracks. It
duplicates the known sync-click track so the default Audio mix must combine two
included Media tracks into one Generated audio mix. The measured half-open
Selection was `[2,000,000us, 8,000,000us)`.

The temporary investigation page warmed both paths, then ran two alternating
trials per path and recorded the median runner time. It also ran the old
video-only stage separately to measure the otherwise private intermediate
artifact. The page and prototype were removed after their lifecycle cases moved
to the production runner tests.

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

The production mixed-audio runner calls
`Conversion.init({ composable: true })`, allowing Conversion to add and drive
the video track without owning the Output lifecycle.

| Resource | Owner and normal lifecycle | Abort or failure cleanup |
| --- | --- | --- |
| Mediabunny `Input` | The runner creates it from the source Blob; disposable scope disposes it after the artifact is captured. | Disposable scope disposes it. |
| `Conversion` | The runner initializes and executes it; it drives only video and is marked settled after `execute()` resolves. | The runner cancels it while execution is unsettled. |
| `AudioBufferSource` | The runner adds it to the same Output, adds the rendered Generated audio mix in parallel with Conversion, then closes it. | Disposable scope closes it exactly once. |
| `Output` | The runner creates it; after all tracks are registered, the runner starts it. After Conversion and audio source completion, the runner finalizes it. | The runner cancels it until finalization succeeds. |
| `BufferTarget` | Output writes the sole final artifact into it; the runner reads it only after finalization. | Output cancellation releases encoder and muxer resources; the target is then collectible. |
| Rendered `AudioBuffer` | `renderBrowserAudioMix` creates it before Output work; Web Audio exposes no explicit disposal API. | It becomes collectible after the Export job settles. |

Production-runner failure injection covers Export cancellation, Conversion
execution failure, audio-source failure, Output finalization failure, and a
composable Conversion that utilizes no video track. Each case checks
Conversion/Output cancellation as applicable, AudioBufferSource closure, and
Input disposal. Success checks exactly one source `BlobSource`, one Output, one
start/finalize pair, and no cancellation.

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
  production runner therefore rejects a discarded or missing video track
  explicitly instead of allowing an accidental audio-only artifact.

## Production adoption

`default-export-runner.ts` now keeps the direct non-composable Conversion for an
all-excluded Audio mix and uses shared-Output orchestration when the mix includes
Audio. Output settings, quality choices, Selection trimming, progress, and the
separate Generated media delivery boundary remain intact. The old remux helper,
encoded-packet copy dependencies, temporary prototype, and comparison page were
deleted.

The two-audio source is now a normal export-correctness fixture rather than a
prototype-private input. Production-runner tests retain all-excluded and
zero-volume Audio mix cases and cover the mixed path's success, cancellation,
failure cleanup, and missing-video guard.

The production route was re-verified in the user-owned Chromium runtime with
the two-audio fixture. Local analysis exposed both `Sync clicks A` and
`Sync clicks B`; Export review reported two included source tracks to one AAC
Generated audio track; and the runner reached `Export complete` with an
MP4/H.264/AAC, 160×90 Generated media artifact. Download was not invoked, so
Delivery remained an explicit post-export action.
