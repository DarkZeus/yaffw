# Mediabunny 1.65.2 upgrade verification

The adapter runner generates independent ffmpeg fixtures, validates packet
timestamps with ffprobe, then loads production adapters through the existing
Vite app. It neither starts a server nor installs dependencies.

```sh
YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium \
node verification/mediabunny-upgrade/check.mjs
pnpm exec tsc --project verification/mediabunny-upgrade/tsconfig.json
pnpm exec biome check --config-path verification/mediabunny-upgrade verification/mediabunny-upgrade
```

`YAFFW_ORIGIN` defaults to `http://127.0.0.1:3000`. The optional first CLI argument
sets the evidence JSON path, defaulting to `tmp/mediabunny-upgrade/evidence.json`.
The fixture recipes are executable in `fixtures.mjs`; every run regenerates media
under ignored `tmp/mediabunny-upgrade/` and records hashes and stream metadata.
Use a browser with H.264/AAC/Opus/Vorbis WebCodecs support.

Video coverage uses a 61-second 10 fps H.264 file with B-frames and 20-second GOPs.
The MKV remux initially contains four CuePoints. Replacing the later three with
equal-length EBML Void elements leaves exactly one validated CuePoint and keeps
all cluster/SeekHead offsets unchanged. The first lookup is near 60 seconds,
followed by adjacent, reversed and cross-GOP requests. Both direct key/ordinary
packet lookups are compared against independent ffprobe timestamps. Production
scrub must present the exact packet timestamp at each target. Production video
strip extraction must return a nonempty image for each requested position. This
is correctness evidence for sparse cues, without claiming a measured speedup.

Audio coverage uses continuous and missing-packet twins for WebM Opus, MKV AAC,
WebM Vorbis and MP4 AAC. Removing frames between seconds 2 and 3 preserves packet
timestamps. Both production generated-mix range decoding and Preview window
provider run from seconds 0, 2.5 and 3.2, with PCM probes before/inside/after the
gap and at 50 ms for encoder preroll. All AAC and Opus variants must expose a
negative first packet timestamp. Continuous twins must remain audible at all
probes, and gap twins must be silent only inside the omitted interval.

The runner awaits generation cancellation and provider disposal between cases.
Deterministic pending-sample cleanup, stale publication, concurrent disposal and
abort rejection are covered by the production unit tests:

```sh
pnpm test src/editor-next/media-work/tests/mediabunny-audio-buffer.test.ts \
  src/editor-next/media-work/tests/audio-packet-timeline.test.ts \
  src/editor-next/media-work/tests/disposable-media-work-scope.test.ts \
  src/editor-next/media-work/tests/media-source-failure-boundary.test.ts \
  src/editor-next/audio/tests/bounded-preview-audio-window-provider.test.ts \
  src/editor-next/preview/tests/mediabunny-scrub-frame-provider.test.ts \
  src/editor-next/export/tests/default-export-runner.test.ts
```

This adapter proof does not establish physical synchronization, device output,
Firefox/Safari behavior, every container, or final muxed export alignment. The
separate `app-check.cjs` verifies user-facing workflows and generated artifacts.

Run the actual editor workflow separately after source edits/builds finish, so
Vite hot reload does not unload the active asset mid-check:

```sh
YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium \
node verification/mediabunny-upgrade/app-check.cjs
```

This uses the committed two-audio flash/click MP4 and an ffmpeg stream-copy MKV
remux. It drives actual file selection, Play/Pause, late seeks, keyboard Selection,
Export, explicit download and re-import. ffprobe checks delivered track inventory
and duration; ffmpeg checks five paired bright/audible events and a quiet/dark
control. It records waveform workers and actual AudioEncoder input formats.
Output and evidence are ignored under `tmp/mediabunny-app/`. A stable format does
not prove the upstream midstream-format fix; event samples do not prove exact
selected boundary frames. The native-provider regression is covered by the
Preview player unit tests and actual MKV playback here.

The eleventh fixture remuxes the committed two-audio flash/click MP4 to MKV
without re-encoding. Its cluster-ending AAC packets have unknown (zero) metadata
duration. Both production audio decode paths must retain primary-track click
onsets at 1.021 through 9.021 seconds (15 ms tolerance, 5 ms PCM bins), including
range starts 2.005 and 2.010 seconds at/inside an unknown-duration packet. This
catches cumulative phantom-gap drift that continuous tones cannot reveal.
Library track-end metadata can still omit an unknown final packet's duration;
this proof does not establish exact end-of-file presentation.
