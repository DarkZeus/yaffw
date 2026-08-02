# Direct Preview audio resource investigation

Issue #103 tested whether Mediabunny 1.52.2 can prepare the Web Audio Preview resources directly, without the remux/WAV Blob and object-URL bridge introduced by issue #97.

## Fixtures

Both fixtures are real MP4 containers generated with FFmpeg and inspected with `ffprobe` before browser testing.

| Fixture | SHA-256 | Shape |
| --- | --- | --- |
| `large-two-aac.mp4` | `2123ca575a288b1f3612948df4e22793f4d6b942a97edd2289a5516a378509f6` | 36,057,506 bytes; 120 s H.264; two distinct stereo AAC 48 kHz tracks (440 Hz and 880 Hz) |
| `offset-gap-two-aac.mp4` | `633506430608cca0bc5411a7f522f26fcb545ff326425c5ecc3607cc96c61aba` | 519,518 bytes; 12 s H.264; two mono AAC 48 kHz tracks starting at 0.728 s and 1.478 s; track 2 contains silence from media time 3.478 s through 5.478 s |

The offset fixture was generated from two sine sources using `asetpts=PTS+0.75/TB` and `asetpts=PTS+1.5/TB`; the second source applies zero volume between source time 2 s and 4 s. A preliminary fixture used a missing MP4 packet interval. Mediabunny's MP4 packet and sample sinks normalize that discontinuity into a continuous packet timeline with trailing silence, so both the old remux bridge and direct path see the same normalized timeline. The encoded-silence fixture is the stable gap oracle for this dependency version; the shared assembler also has an automated regression for packet gaps when a format exposes them.

## Browser result

Chromium decoded both fixtures with zero failed tracks. The direct resources retained native track rate/layout and exact analyzed starts:

- offset fixture track 1: mono, 48 kHz, start 0.728 s, decoded duration 9.021333 s;
- offset fixture track 2: mono, 48 kHz, start 1.478 s, decoded duration 8.021333 s;
- large fixture: two stereo, 48 kHz, 120 s resources, 46,080,000 decoded bytes each.

Signal probes over 200 ms windows separated the large fixture by more than four orders of magnitude: track 1 measured about 0.062 at 440 Hz and at most 0.000002 at 880 Hz; track 2 measured about 0.062 at 880 Hz and at most 0.000002 at 440 Hz. In the offset fixture, track 2 measured RMS 0 at media times 3.6 s, 4.0 s, and 4.8 s, while track 1 remained about 0.088 RMS. This proves track separation, non-zero starts, and the intentional silence gap in the produced `AudioBuffer` data.

The live editor loaded the offset fixture, exposed both track strips, and played through the Web Audio audio-master clock. The top-bar and Preview playhead readouts advanced together; 1.5x playback and a one-second seek remained functional. Soloing Audio 1 produced signal only on Audio 1 while Audio 2 read -90 dBFS. Soloing Audio 2 produced -18.1 dBFS on Audio 2 while Audio 1 read -90 dBFS.

## Serial prototype performance and memory

The initial direct-path prototype decoded its tracks sequentially. The table compares that serial prototype with the remux/WAV bridge using the same large fixture in fresh in-app Chromium tabs. Renderer RSS is the combined resident size of the two renderer processes allocated for the tab. It is an observed process-level bound, not resource-exclusive accounting. JS heap omits native `AudioBuffer` storage and is secondary evidence.

| Measurement | Remux/WAV bridge | Serial direct prototype | Difference |
| --- | ---: | ---: | ---: |
| Resource preparation | 99.5 ms | 553.9 ms | +454.4 ms |
| Engine ready | 348.6 ms | 556.9 ms | +208.3 ms (1.60x) |
| Renderer RSS peak growth | 561,008 KiB | 170,864 KiB | -69.5% |
| Renderer RSS growth 10 s after release | 309,888 KiB | 114,720 KiB | -63.0% |
| Observed JS heap peak | 116,130,240 bytes | 149,108,828 bytes | +32,978,588 bytes |

The serial prototype removed two remux output buffers, two compressed per-track Blobs/object URLs, Blob-to-ArrayBuffer copies, and the second Web Audio decode pass. The dominant retained resource remained the unavoidable 92,160,000 bytes of full-track float PCM. Its roughly 208 ms readiness regression came from serializing independent track preparation and is not an accepted production tradeoff or a measurement of the concurrent implementation.

## Parallel scheduling correction

Production preparation keeps the direct `AudioBuffer` path and starts independent per-track metadata and decode work concurrently. Results are collected in asset-track order, so a later track may finish first without changing resource or failure ordering. The concurrency regression test holds both decode promises open, proves both have started, resolves track 2 before track 1, and verifies the ordered result.

A fresh Chromium validation used a 34,955,625-byte, 120-second H.264 MP4 with distinct stereo AAC 48 kHz tracks at 440 Hz and 880 Hz (SHA-256 `08e17bbe1197a8d5eeb00b15b2266ed5a3bc85e65e609747daa8bb6084f83220`). Both audio strips and the master meter reached ready state with zero failed tracks. The serial table above should not be used to quote current readiness or memory behavior; a controlled head-to-head run is required for new performance figures.

## Lifecycle result

The production boundary and automated tests cover:

- immediate `Input.dispose()` on cancellation, plus scope disposal on success or failure;
- concurrent per-track decode start with deterministic asset-track result ordering;
- sample closure after copy, format errors, and aborts;
- per-track metadata/decode failure isolation and explicit degraded engine state;
- retry through preparation for only the failed track, preserving successful resources;
- stale-result rejection after asset replacement or cleanup;
- engine destruction and dropping all `AudioBuffer` references on active-asset disposal;
- seek, playback-rate, channel routing, metering, and total-failure native-video fallback.

## Decision

The proof succeeds. Preview resources are direct `AudioBuffer` values produced by the shared Mediabunny timestamp assembler. The remux/WAV Blob bridge, object-URL lifecycle, engine `decodeAudioData()` boundary, and engine-level decode retry are superseded and removed.
