# Scrub keyframe index evaluation (#122)

Use the user-owned Vite app at `http://127.0.0.1:3000`; these commands do not start
another server or install packages. Set an installed Playwright package path and
a Chromium executable with H.264 WebCodecs support:

```sh
export YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright
export YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium
node verification/scrub-index/check.mjs
node verification/scrub-index/app-check.mjs
pnpm exec tsc --project verification/scrub-index/tsconfig.json
pnpm exec biome check --config-path verification/scrub-index verification/scrub-index
```

Both browser entry points call `generateFixtures()` from `fixtures.mjs` before opening a
browser. `app-check.mjs` can run directly without a prior `check.mjs` run; it uses the
fixture paths returned by setup.

`YAFFW_ORIGIN` optionally overrides the origin. Output, generated media and
instrumented modules go to ignored `tmp/scrub-index/`. Fixtures require ffmpeg and
ffprobe on PATH. The baseline comes from immutable commit
`234286135b2c2af3272ec94fc4a4392fd607e792`; that commit must exist locally.
The runner verifies Mediabunny 1.65.2, instruments the actual current production
provider as the direct candidate, and records its source SHA-256. The indexed
provider and removed index come from Git rather than a retained alternate
production runner. Relative imports are resolved to their production owners;
both variants use the current decoded cache. Observation-only instrumentation
counts reads and readiness without requiring unrelated source formatting or
helper extraction to match historical text.

Four deterministic fixtures cover 600-second H.264/B-frame MP4, its Matroska
remux with 500 ms cluster limit and 60 cues, an equal-length MKV with 59 later cues
replaced by EBML Void, and a 61-second MP4 with 20-second GOPs. See `fixtures.mjs`
for recipes, structural assertions and independent ffprobe packet truth.

Three repetitions alternate variant order. Every session uses a fresh page,
input, decoder and cache. Immediate requests follow adapter readiness; prepared
requests follow baseline index completion plus a common 200 ms idle interval
(direct has only that interval). Targets cover late cold lookup, adjacent forward
movement, warm cache, cross-GOP movement and backward movement. Each session
also issues four rapid reversals and disposes with a pending request. Source
`read` events count retrieved bytes, including prefetch and repeated ranges;
they do not measure OS disk traffic. Index entries count preparation and retained
timestamp payload; total browser heap is not measured. Latency stops at the
provider callback. Pixel checks run after measurement/disposal against a separate
VideoSampleSink at the same target; ffprobe independently checks timestamps.
WebSocket interception prevents Vite reloads from invalidating trials.

The live app runner uses real file selection, Play/Pause, keyboard late seeks,
frame stepping and reversals, then confirmed Close file and replacement.
It checks playhead state and waits for the visible decoded-scrub canvas to match
a fresh reference sample at the final target, including after replacement, with
no page errors.
The isolated provider trials establish decoded frame identity; native-video
clock and canvas handoff remain covered by existing player/transport tests.

[Recorded outcome and limitations](../../docs/verification/scrub-index.md).
