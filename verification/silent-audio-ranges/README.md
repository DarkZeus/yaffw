# Silent selected-range export proof

These harnesses reuse the existing development server at `http://127.0.0.1:3000`.
They do not start a server or install dependencies. Set `YAFFW_ORIGIN` to override
that origin; set `YAFFW_PLAYWRIGHT_PATH` and `YAFFW_BROWSER_EXECUTABLE` to an existing
Playwright package and Chromium executable with H.264/AAC/Opus support.

```sh
node verification/silent-audio-ranges/check.mjs candidate
node verification/silent-audio-ranges/app-check.mjs
pnpm exec tsc --project verification/silent-audio-ranges/tsconfig.json
pnpm exec biome check --config-path verification/silent-audio-ranges verification/silent-audio-ranges
```

`check.mjs` creates and then reuses a six-second H.264/Opus MKV using ffmpeg.
Its first audio track begins near one second, ends near five seconds, and contains a real missing
packet interval between two and three seconds. The second track has healthy
880 Hz pulses matching the generated video luminance pulses every half second.
ffprobe independently verifies that no first-track packet overlaps any tested
Selection: `[0.2,0.7)`, `[2.2,2.7)`, and `[5.3,5.8)`.

For each Selection the production default runner exports four decisions: only the
sparse track included, both tracks included, all tracks excluded, and No audio.
Delivered MP4 files are independently decoded with ffmpeg. Included silent tracks
must retain a stereo 48 kHz Opus track with RMS below 0.0001 (the default
Output settings preserve the source codec); mixed healthy audio must exceed
0.02 RMS and have its pulse onset within 35 ms of the video event. Excluded and
No audio outputs must have no audio track. Every output must last 0.5 seconds
within 60 ms (the observed Opus mux duration is 0.5135 seconds). Evidence includes
browser version, fixture hash, full ffprobe packet and stream inventory, output
stream metadata, PCM measurements and event times.

`check.mjs baseline` intercepts only the browser decoder module with the original
source from commit `855c5ed7`, transpiled using the installed TypeScript package.
Other production modules and the local source tree are unchanged. This records all
six included-track exports failing with
`The audio track decoded no presentable samples.` The six omit-audio controls
succeeded. Baseline and candidate reuse identical fixture bytes; set
`YAFFW_REGENERATE_FIXTURE=1` explicitly to replace the fixture. Evidence records
the source revision, browser version and fixture hash. Run `baseline` then
`candidate` to reproduce the before/after comparison.

`app-check.mjs` drives actual local-file import, keyboard Selection, Export,
explicit Download export, independently decoded artifact checks, Selection edit
that invalidates delivery, Close file, and re-import of the downloaded result.
It exercises both the healthy mix and an all-silent included-track decision in
the real packet gap. Run it after source edits finish so hot reload cannot reset
the active asset. Results, screenshots and generated media are ignored under
`tmp/silent-audio-ranges/`.

The proof covers this Chromium environment and fixture format. It does not claim
physical playback synchronization or other browsers. The fixture audio is mono
Opus decoded at 48 kHz; channel/rate permutations, malformed metadata, decoder
failure, cancellation and resource cleanup are covered by production unit tests.
The source's MKV cluster-ending packets expose zero duration to Mediabunny even
where ffprobe reports 20 ms. Thus gap and trailing cases also exercise decoded
predecessor-tail evidence, rather than accepting typical-duration guesses.
