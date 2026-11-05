# Waveform packet-gap alignment (#118)

Recorded on 2026-11-06 (Europe/Kiev), Chromium 155.0.8059.85 through Brave,
against the already running local Vite app. The reproducible runner is
`verification/waveform-gap/check.mjs`; see its README for commands.

## Before and after

The baseline was captured before production changes in
`tmp/waveform-gap/before.json`. The retained before/after and actual-editor
JSON is `docs/verification/waveform-gap-evidence.json`. All four continuous twins passed. All four
missing-packet fixtures failed waveform placement while the production Preview
window provider and generated-mix source range decoder passed their existing
PCM controls. Packets between approximately 2 and 3 seconds had been omitted
without resetting their timestamps.

Each table value is the maximum normalized waveform bucket amplitude in a
50 ms interval starting at the probe. The waveform has 8192 buckets over a
5.1-second media-time range (about 0.623 ms per bucket).

| Fixture | Before at 2.5s | After at 2.5s | Before at 4.5s | After at 4.5s |
| --- | ---: | ---: | ---: | ---: |
| Opus WebM gap | 0.970989 | 0 | 0 | 0.971268 |
| AAC MKV gap | 0.564886 | 0 | 0 | 0.560443 |
| Vorbis WebM gap | 0.993145 | 0 | 0 | 0.990223 |
| AAC MP4 gap | 0.564886 | 0 | 0 | 0.561808 |

The final run (`tmp/waveform-gap/after.json`) passes all 15 fixtures. Continuous
twins remain audible at every tone probe. Gap twins are silent inside the
omitted interval and audible after it. Preview and generated-mix source PCM
are independently checked at media times 0.05, 1.5, 2.5, 3.5 and 4 seconds,
for ranges starting at 0, 2.5 and 3.2 seconds.

Four additional continuous stream-copy MKV twins add a 0.7-second input offset.
All have silent 0.1-second waveform/0.05-second PCM probes and audible later
probes. First nonzero waveform buckets are at 0.699133 seconds (Opus),
0.685437 seconds (AAC, both input containers) and 0.699756 seconds (Vorbis).
The offset assertions preserve the leading silence; AAC encoder priming means
its first audible bucket need not be exactly 0.700 seconds.

The existing two-audio MKV click fixture exercises cluster-ending AAC packets
whose metadata duration is zero. Primary-track waveform onsets remain at
1.020508, 2.020264, 3.021240, 4.020996, 5.020752, 6.020508, 7.020264,
8.021240 and 9.020996 seconds, within the 15 ms gate around independently
established 1.021 through 9.021-second events. Preview and export-source
range decoding pass the same onset gate from starts 0, 2.005 and 2.010 seconds.

## Worker lifecycle and actual editor

Every fixture traverses `loadBrowserWaveformLane` and the actual production
worker. The ready result contains 8192 Float32 buckets, with a 32768-byte
worker message payload. Cache reuse creates no additional worker. Success,
immediate abort and missing-track unavailability each terminate exactly once.
Abort rejects as `AbortError`. An unavailable worker result is final.

`verification/waveform-gap/app-check.mjs` creates a video-bearing MKV with the
same Opus gap and imports through the actual file input. The ready
Wavesurfer surface advertises 8192 samples; the actual waveform worker is
observed. The screenshot (`tmp/waveform-gap/ui-after.png`) was visually
inspected: the silent interval falls around seconds 2–3 under the ruler,
with tone restored afterward. Play/Pause advances the actual video follower.
The full Selection is exported and explicitly downloaded. Independent ffmpeg
PCM probes on the delivered MP4 return RMS 0.125178 at 1.5 seconds,
0.000000132 at 2.5 seconds, 0.123915 at 3.5 seconds and 0.123111 at 4.5 seconds.
The automated gate is below 0.001 inside the gap and above 0.03 outside it.

## Verification and limits

The scoped TypeScript and Biome checks pass. Production regression tests own
variable and unknown packet durations for PCM/ulaw/alaw, delayed sample
cancellation, and packet-read errors; this browser harness uses actual
fixed-format codec fixtures. The PCM path keeps its accurate decoder timestamps
without applying compressed-codec packet-gap projection. Real continuous/gap
PCM MKV fixtures pass the same silence/tone probes.
Leading-offset fixtures intentionally analyze the first 5.1 seconds, without
claiming complete tail coverage. Immediate abort verifies the real worker
termination boundary, without asserting sample disposal inside a terminated
worker. Screenshot placement is visually checked; numeric placement assertions
use the production worker output. Final muxed export evidence uses the Opus
video fixture; the other codecs exercise the production export source decoder.
These checks do not establish physical audio/video synchronization, device
output, every container, Firefox/Safari behavior or exact end-of-file timing.
