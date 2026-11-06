# Copy boundary tolerance proof (#121)

These runners use the existing app at `http://127.0.0.1:3000`. They never start a
server or install packages. Point to an installed Playwright package and a
Chromium executable with AVC/AAC/VP8/Opus support:

```sh
export YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright
export YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium
node verification/copy-boundaries/check.mjs
node verification/copy-boundaries/app-check.mjs
node verification/copy-boundaries/summarize.mjs
pnpm exec tsc --project verification/copy-boundaries/tsconfig.json
pnpm exec biome check --config-path verification/copy-boundaries verification/copy-boundaries
pnpm exec vitest run verification/copy-boundaries/tests/artifact.test.mjs
```

Both `check.mjs` and `app-check.mjs` call `generateFixtures()` from `fixtures.mjs`
before opening a browser. Either can run directly; the app check does not require a
prior comparison run.

`YAFFW_ORIGIN` optionally overrides the origin. ffmpeg/ffprobe must be on PATH.
Mediabunny must be exactly 1.65.2. `YAFFW_REPEATS` defaults to two; the second
repetition reverses policy order. Fixtures are reused byte-for-byte; explicitly
set `YAFFW_REGENERATE_FIXTURE=1` to regenerate them. Everything generated goes
under ignored `tmp/copy-boundaries/`, including complete packet/frame evidence,
artifacts, UI screenshots and compact summaries. `summarize.mjs` accepts optional
input and output filenames; it retains first/last records and counts, while full
records remain reproducible through `check.mjs`.

The source recipe creates eight-second, 160×96 AVC/AAC MP4 files. Twelve binary
luminance cells encode each original 60 Hz frame tick; flashes at integer seconds
and independently encoded audio bursts provide A/V events. CFR has 480 frames;
VFR removes every third tick after two seconds without closing timestamp gaps,
leaving 360 frames. Both use long GOPs and B frames. Fixture hashes and independent
source frame/PCM observations are recorded. Color bytes are raster fixture data.

The unchanged production runner is compared with two temporary request-time
instrumentations: `boundaryTolerance: 0.05` and `boundaryTolerance: 0`. An asserted
single replacement changes only the copy options in Vite's served module. All
three retain preferred copy, expand, and `shiftTolerance: 0`. No alternate runner
or product policy setting remains in production. Each trial has a fresh page and
input; encoder-call counters distinguish actual video encoding from packet-copy
paths without inferring strategy from codec names. Export time wraps just the
production runner; separate harness time also includes source analysis and
Generated media metadata inspection, excluding external boundary inspection.
Small synthetic files establish behavior, not production throughput.

The main Selections are `[1.137,5.283)` CFR and `[2.137,6.283)` VFR. Both start off
keyframes and end off frame boundaries. VFR MP4/MOV additionally use
`[5.013,7.283)` near a keyframe. CFR MP4 repeats with No audio. All five supported
containers run compatible output settings: AVC/AAC for MP4/MOV/MKV/MPEG-TS,
VP8/Opus for WebM. WebM necessarily transcodes this AVC source. Zero shift causes
the other non-edit-list formats to transcode these negative-start copy regions;
this is not proof that those formats can never copy.

Measurement separates:

- Source-frame identity/coverage, first output PTS, final frame duration and video
  output endpoint. The boundary helper uses first source-frame PTS and final
  source-frame PTS plus its **actual output duration**. Full source-frame coverage
  is recorded separately. This is frame-quantized evidence, not a sub-frame content
  measurement. Unknown final intervals yield no boundary evidence.
- Normal packet PTS/DTS, negative PTS, negative-DTS-only reorder lead-in, and raw
  MP4/MOV packets/frames with edit lists disabled. Encoded preroll is not presumed
  visible merely because it exists in the file.
- Inspected artifact duration, native media duration, video interval duration and
  decoded PCM duration. Audio padding can outlast video, holding its final image.
- Decoded flash/click timestamps and added A/V delta relative to independently
  decoded source events. The 40 ms assertion is an event-alignment regression
  budget; the PCM threshold observer resolves onsets at sample resolution within
  5 ms envelope bins. No physical speaker/display synchronization is measured.

Chromium native endpoint seeks independently confirm the visible first/last
barcode identities for MP4, MOV and WebM. They do not prove final frame duration;
ffprobe/ffmpeg provide that interval evidence. Native MKV/MPEG-TS playback is
explicitly outside the observer; their packet, frame and PCM artifacts are still
independently decoded. No universal browser/container playback claim follows.

The existing artifact harness receives the measured video boundary evidence and
runs the existing classifier and Export review planner. Reports say Boundaries
verified only within the nominal frame tolerance for that artifact. Audio tails
and A/V measurements remain separate. Unmeasured product exports retain
Boundaries unverified; fixture evidence is never cached as a general guarantee.

The UI runner imports each fixture, plays/pauses, chooses an off-keyframe range
using transport/keyboard commands, checks the conservative Export review,
exports, explicitly downloads, independently inspects the result, invalidates
Generated media by editing Selection, closes the file, then re-imports and plays
the delivered artifact. It also exercises the real No audio settings path.

[Recorded decision and measurements](../../docs/verification/copy-boundaries.md).
