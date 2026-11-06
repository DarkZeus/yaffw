# Real frame timing fixtures

This harness generates small H.264 MP4 assets with ffmpeg, checks their actual
presentation timestamps with ffprobe, and passes their bytes through production
local asset analysis in a separate headless Chromium browser. It also computes
raw Mediabunny metrics in Node and Chromium, comparing those results exactly.
Mediabunny must remain the project-pinned **1.65.2** for this proof.

Use the already-running development app on port 3000. This harness does not start
a server or require fixture delivery through `public/`.

```sh
node verification/frame-timing/fixtures.mjs
YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
  node verification/frame-timing/check.mjs
YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
  node verification/frame-timing/app-check.cjs
```

Both `check.mjs` and `app-check.cjs` invoke `generateFixtures()` before opening a
browser, so the app check can run directly without a prior analysis run.

The first command is optional; `check.mjs` always regenerates fixtures. Set
`YAFFW_BROWSER_EXECUTABLE` to use a particular installed Chromium executable and
`YAFFW_ORIGIN` to use another already-running app origin. Without an executable
override, Playwright uses its installed Chromium. No dependency is installed.

Generated media and default evidence are ignored under `tmp/frame-timing/`.
An optional first argument writes evidence to another location:

```sh
YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
  node verification/frame-timing/check.mjs \
  docs/verification/evidence/frame-timing-analysis-2026-11-05.json
pnpm exec biome check --config-path verification/frame-timing verification/frame-timing
```

`fixtures.mjs` contains the full executable ffmpeg recipe. All fixtures use
160×90 testsrc2 frames, libx264 with no B-frames, a 1 μs encoder/container time
base, and passthrough timestamps. The cases are:

| File in `tmp/frame-timing/` | Timestamp construction |
| --- | --- |
| `fractional-cfr.mp4` | 360 frames at 30000/1001 fps |
| `dropped-cfr.mp4` | A 30 fps lattice with each input frame where `n % 10 === 4` removed; continue until 360 output packets |
| `vfr.mp4` | 360 frames; timestamp in μs is `N*37000 + 7000*sin(N*1.7)` |
| `single-frame.mp4` | One 30 fps input frame; no measurable timestamp interval |
| `nonzero-start.mp4` | 360 frames on a 30 fps lattice, shifted forward 2 seconds |
| `late-vfr.mp4` | 600 frames; 33333 μs intervals for the first 300, followed by sinusoidal timestamp variation |

Assertions require correct known/estimated classification, exact preservation of
the seven analysis fields, the rounded positive navigation interval, retained VFR
best guess rather than an unconditional 30 fps fallback, and fallback rejection
of the single-packet library result. They independently verify dropped gaps,
fractional cadence, the nonzero first timestamp, and the difference between the
256-packet sample and a whole-file scan of `late-vfr`.

The helper imports the actual analyzer, domain analysis and runtime detector
through Vite. It does not fabricate metrics or intercept production modules.
The fixture assertions intentionally target timestamp semantics, since ffmpeg
versions can change encoded bytes. Evidence records hashes, runtime versions,
raw bounded and whole-file metrics, ffprobe summaries, and production results.

The harness does not prove physical playback or exact visual frame stepping.
It covers one video track in synthetic MP4 files without audio or B-frames;
other containers, codec reordering, decoding quality and device output remain
outside this proof. The separate application check covers visible labels and
frame-action navigation. See `docs/verification/frame-timing.md` for the recorded
result and interpretation.

`app-check.cjs` uses a fresh browser page per fixture and the actual file picker,
Media tab, Analysis disclosure, transport buttons, keyboard Selection commands,
Export controls, explicit download, re-import and Close file confirmation. It
checks nominal step sizes and bounds against the asset duration shown by the
editor, separately recording the native element's presentation duration. The
nonzero-start fixture demonstrates why those values must not be conflated.
Set `YAFFW_FRAME_TIMING_APP_REPORT` to save application evidence elsewhere;
otherwise it writes `tmp/frame-timing/app-evidence.json`. It also captures the
VFR Analysis panel in `tmp/frame-timing/vfr-analysis.png` for visual review.
