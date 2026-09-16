# Production Preview audio evidence

Use the existing development server at
`http://127.0.0.1:3000/verification/preview-audio-production/`.
This physical HTML entry is outside the product route tree and production build.

Select the controlled 120-second two-stereo-AAC fixture from issue #108 for
**Run 5 production trials** and **Run production functional checks**.
The five performance trials each run for 30 seconds and independently inject
250/500/1,000 ms renderer stalls at elapsed seconds 4/10/18.
The page keeps performance, functional, and gap results together in the JSON
display and download. Complete source edits before recording: Vite reloads
invalidate active runs.

## Offset and encoded-silence fixture

Generate the separate fixture for **Run offset/gap fixture checks**:

```sh
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i 'testsrc2=size=160x90:rate=30:duration=12' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=9' \
  -f lavfi -i 'sine=frequency=880:sample_rate=48000:duration=8' \
  -filter_complex "[1:a]asetpts=PTS+0.75/TB[a1];[2:a]volume=enable='between(t,2,4)':volume=0,asetpts=PTS+1.5/TB[a2]" \
  -map 0:v -map '[a1]' -map '[a2]' \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart \
  /tmp/yaffw-preview-audio-109-offset-gap.mp4

ffprobe -v error \
  -show_entries format=duration,size:stream=index,codec_name,codec_type,sample_rate,channels,start_time,duration \
  -of json /tmp/yaffw-preview-audio-109-offset-gap.mp4
shasum -a 256 /tmp/yaffw-preview-audio-109-offset-gap.mp4
```

The verification fixture is 781,548 bytes, SHA-256
`8c9ccca2c14f6ea4c093091341ab44287767a0d81872d6b6b907aef11f6d732f`.
Its video duration is 12 s. ffprobe reports mono 48 kHz AAC audio starting
at 0.728 s and 1.478 s, with durations 9.021333 s and 8.021333 s.
Codec-version changes may change the hash; inspect a replacement fixture before
changing the harness's exact-fixture check.

Independent FFmpeg-decoded 200 ms RMS probes measured:

| Media time | Track 1 | Track 2 |
| --- | --- | --- |
| 2.5 s | 0.088371 | 0.088331 |
| 4.5 s | 0.088330 | 0 |
| 6 s | 0.088325 | 0.088329 |

Browser probes verify silence before both starts, the first track beginning
before the second, both tracks playing, only the second track becoming silent,
its recovery, and silence after both audio tracks end while video continues.
This is encoded silence, not a missing-packet fixture. Provider tests cover
timestamp gaps exposed by the demuxer.

## Measurement boundaries

Readiness measures production resource metadata preparation and bounded engine
priming; fixture inspection and digest calculation happen before timing.
PCM retention comes from the production scheduler's owned AudioBuffers.
Provider publication counters measure cumulative published PCM and media time,
not decoder-private allocations or total process memory. Independent wrappers
observe source disconnects, provider disposal, and awaited AudioContext close.
Provider tests verify individual sample, iterator, and Input ownership.

Functional checks exercise production engine methods and graph meter taps.
The application still needs separate browser verification for controls, video
synchronization, waveform independence, and lifecycle wiring.
