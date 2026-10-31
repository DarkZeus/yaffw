# Mediabunny 1.65.0 upgrade

Upgraded 2026-10-31 from 1.52.2 to 1.65.0 (34 stable releases). This record covers what YAFFW adopted, what it kept on purpose, and the browser evidence behind each decision. It supersedes the plan in [the 1.56.0 audit](dependency-audit-mediabunny-1.56.0.md). Browser checks ran in the desktop app's Chromium pane against the Vite dev server.

## Adopted

| Area | Change | Evidence |
| --- | --- | --- |
| Export copy path (1.56, 1.58) | `Conversion.init` pins `copy: { shiftTolerance: 0 }`. Copying stays automatic, but copied video can never be shifted away from the Selection-relative timeline that the separately generated zero-based audio mix assumes. | Runner unit test. All five export fixtures succeed for the full and selected-range Selections. |
| Export audio priming (1.63) | Automatic. Encoder priming is now compensated and written as negative audio timestamps (an MP4 edit list). | Selected range of `sync-flash-click.mp4`: each flash at *t* has its click at *t* + 0.3 ms. |
| Scrub decoding (1.55.4, 1.57, 1.61, 1.64) | The scrub provider decodes through a forward `VideoSampleSink.samples()` iterator instead of a raw `VideoDecoder`. It keeps one iterator per GOP and reseeds on a GOP jump or reversal. It inherits Mediabunny's decoder workarounds (Chromium color-space completion, stale frames on Android, Firefox and WebKit fixes) and draws each sample with its own rotation and flip. `canDecode()` replaces `VideoDecoder.isConfigSupported`. | Scrub output matches `CanvasSink` pixel quadrants for plain, horizontally flipped, and rotated+flipped H.264 fixtures. Unit tests cover GOP reuse and reseed, sample closing, and an undecodable track. |
| Frame timing (1.54) | The analyzer uses `computeFrameRateMetrics().bestGuessFrameRate` (256 probed packets by default) instead of averaging 30 packets. | 10 fps and 50 fps fixtures detected exactly. |
| Track bitrate (1.57) | `bitrate` on video and audio Media tracks comes from `getAverageBitrate()`, falling back to `getBitrate()`. These are container-declared values, not measurements. The Analysis facts show it. | The editor shows "Bitrate 4.44 kbps" for an ffmpeg file with a `btrt` box. |
| Idle source errors (1.56) | Every production `BlobSource` passes `handleUnhandledError`. One-shot work (analysis, export, generated-media inspection, audio mix, waveform, video strip) races a `MediaSourceFailureBoundary`, so the operation fails and its scope cleans up. The scrub provider reports unavailable. The Preview audio window provider marks every track failed, and the existing per-track retry re-describes them. | Unit tests for the boundary, the work scope, and the audio window provider. |
| Robustness against bad input (1.62), BlobSource leak (1.55.5), MP4 chunk order (1.64), encoder refresh (1.61), resize quality (1.53) | Automatic. No YAFFW code was involved. | Full test suite and the export fixture catalog. |

## Kept on purpose

- **Decoded audio timestamp projection.** It now lives in one shared module, `media-work/adapters/audio-packet-timeline.ts`, used by both the generated mix and Preview audio windows. Fixtures with a 1 s packet gap (WebM Opus, MKV AAC) still decode through `AudioSampleSink` with continuous timestamps in 1.65.0: the last decoded sample is at 2.99 s while the last packet is at 4.00 s. The 1.63 "correct timestamps" work covers preskip and negative starts, not packet gaps.
- **`creationTime`.** Conversion now writes the export time, which is accurate for Generated media. YAFFW does not override it.
- **DTS and TrueHD in Output settings.** The format-derived codec lists now include `dts` and `truehd`. Like the existing `ac3`/`eac3` entries, no browser encodes them natively. Following ADR-0024, they stay listed, and an export with them fails as an Export job failure. The optional `@mediabunny/dts` and `@mediabunny/truehd` extension packages (libavcodec-based) are not added. That needs its own runtime and licensing decision.

## Audio packet gaps (fixed during the upgrade)

Two bugs predated the upgrade:

- **Gap-spanning packet durations.** The packet before a gap often declares a duration that spans the gap. Matroska infers block durations from the next block, and ffmpeg-written MP4 sample tables do the same (1.022 s and 1.024 s in the fixtures). Gap detection found nothing, so audio after a gap played early. `AudioPacketTimeline` now treats a compressed-codec packet more than 3× the typical (lower-median) packet duration as ending after one typical duration. PCM keeps declared durations because its packet sizes legitimately vary. The threshold means gaps shorter than about two frames (roughly 40 ms for 20 ms Opus) are not restored. The Preview scan also keeps the one packet it already reads past the window, so a trailing gap is bounded.
- **Decoder pre-roll across a gap.** When decoding starts inside a gap, or within the codec's pre-roll after one (`getPreRollDuration()`, 400 ms for Opus), the pre-roll decode crosses the gap and collapses it before the sink's start filter. The sink then drops the first post-gap samples. `decodeStartFor()` starts decoding at the packet before such a gap, and the projector places what follows.

Browser evidence: ffmpeg fixtures with a 2–3 s gap (WebM Opus, MKV AAC, WebM Vorbis, MP4 AAC) and their gap-free twins were decoded from 0 s, 2.5 s and 3.2 s, through both the generated-mix decoder and Preview windows. Every gap file is silent from about 2.0 s to 3.0 s and audible elsewhere. No continuous file shows a false gap. The export fixture catalog is unchanged.

### Where each part comes from

Each layer was isolated in Chrome 152 with no YAFFW code involved:

| Layer | Behavior | Evidence |
| --- | --- | --- |
| Container | MP4 has no way to say "silence here", so ffmpeg stores the gap as a 1.024 s sample duration. Matroska blocks carry no duration (SimpleBlocks only, no `DefaultDuration`). | ffprobe packet listing; a raw EBML scan of the fixtures. |
| Mediabunny demuxer | Packet timestamps are correct (2.014 then 3.036 s). For Matroska, each block's duration is set to the distance to the next block, matching MP4 semantics. ffprobe instead derives about 20 ms from the codec bitstream. | `matroska-demuxer.js` (`currentBlock.duration = nextEntry.timestamp - currentBlock.timestamp`); `EncodedPacketSink` output. |
| Chromium `AudioDecoder` | Collapses the gap. Fed chunks timestamped 2.014 then 3.036 s, it outputs 2.0135, 2.0335, … for Opus, AAC and Vorbis alike. `AudioDiscardHelper::ProcessBuffers` seeds a timestamp helper from the first input buffer, then stamps each output with that base plus frames decoded. | Raw WebCodecs decode of the fixtures; [audio_discard_helper.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/audio_discard_helper.cc), used by `FFmpegAudioDecoder`. |
| Mediabunny decoder wrapper | Passes Chromium's timestamps through. It resyncs only when the browser's output timestamp jumps, never against packet timestamps, so it cannot see the gap. `samples(start)` then filters on the collapsed timestamps, which is why pre-roll across a gap drops audio. | `AudioDecoderWrapper` in `media-sink.js`; `AudioSampleSink` output matches the raw decoder. |
| YAFFW | The old gap finder treated a packet's declared duration as how much audio it contains. That never held for MP4, nor for Mediabunny's Matroska durations. | The gap-detection half of this bug was ours. |

WebCodecs does not require decoded audio timestamps to follow input timestamps, so Chromium's behavior is a design choice rather than a spec violation. Firefox and Safari were not tested. No Mediabunny issue covers this yet. Mediabunny could fix it by resyncing to packet timestamps, since it holds them; if it does, the projector's skip-past-gap path makes ours a no-op.
