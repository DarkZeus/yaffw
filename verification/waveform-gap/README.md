# Waveform media-time gap verification

Run against an already running Vite server. No server is started and no packages
are installed. Set browser paths for the local environment:

```sh
export YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright
export YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium
node verification/waveform-gap/check.mjs tmp/waveform-gap/after.json
node verification/waveform-gap/app-check.mjs
pnpm exec tsc --project verification/waveform-gap/tsconfig.json
pnpm exec biome check --config-path verification/waveform-gap verification/waveform-gap
```

`YAFFW_ORIGIN` defaults to `http://127.0.0.1:3000`. Fixture generation reuses
`verification/mediabunny-upgrade/fixtures.mjs` and requires ffmpeg/ffprobe.
The first runner regenerates fixture media and records hashes, packet timing,
waveform probes, real Worker messages/termination and Preview/export-source
PCM controls. Gap probe failures still produce the evidence JSON and exit 1,
allowing the same runner to record a failing baseline before production edits.
Other assertions stop the runner immediately.

Coverage includes eight gap/continuous Opus/AAC/Vorbis tracks, four stream-copy
MKV twins with a 0.7-second leading offset, and the existing unknown-duration
AAC-packet MKV click fixture, plus continuous/gap PCM MKV fixtures. Each waveform request traverses the production
browser loader and actual worker. Success sends 8192 Float32 buckets (32768
bytes); repeated requests reuse the ready cache; abort terminates its worker;
an unavailable track produces a final unavailable worker response. Each case
has one successful worker, one immediately aborted worker, and one worker that
reports an unavailable track.

`app-check.mjs` requires the generated fixtures. It muxes the gap Opus track
with H.264 video, imports it through the actual editor, captures the ready
Wavesurfer lane, exercises Play/Pause, exports/downloads, and independently
checks generated PCM using ffmpeg. Its screenshot requires human inspection
for waveform/ruler placement; adapter assertions provide the automated
placement check. Media, screenshots and JSON are ignored under
`tmp/waveform-gap/`; the durable results are summarized in
`docs/verification/waveform-gap.md`.
