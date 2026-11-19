# Custom video bitrate verification

Start YAFFW locally, then run the check from the repository root with FFmpeg,
ffprobe, Playwright, and Chromium with H.264 WebCodecs support.

```sh
YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright \
YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium \
node verification/custom-bitrate/app-check.mjs
```

`YAFFW_ORIGIN` defaults to `http://127.0.0.1:3000`. The script generates fixtures
and saves actual editor downloads under `tmp/custom-bitrate/`. It requests
3 Mbps in Output settings and measures video packet bytes over the video stream
duration with ffprobe. It checks that the synthetic clips come within 15% of
the target and that every frame retains its presentation time relative to the
Selection.

The 60 fps fixture measured 5.978 Mbps before the fix and 2.986 Mbps with the
fix on Chromium 151 for macOS. WebCodecs received the requested bitrate in
both cases. Adding only the frame-rate hint corrected the overshoot.

At a 3 Mbps target, Playwright's headless shell measured 5.98 Mbps for a
720p120 fixture and 12.39 Mbps for a 4K60 clip. Chrome for Testing
151.0.7922.34 measured 3.01 Mbps and 7.06 Mbps for those same inputs,
respectively, in both windowed and headless mode on macOS. WebCodecs
received the correct bitrate and frame-rate hint in each run.

## 4K60 rate-control comparison

On that same 242-frame clip in Chrome for Testing on macOS, H.264 tracked the
higher targets and flattened near 7 Mbps at low targets.

| Requested Mbps | 0.50 | 1.50 | 3.00 | 6.00 | 10.00 | 16.00 |
| -------------- | ---: | ---: | ---: | ---: | ----: | ----: |
| Measured Mbps  | 6.94 | 6.96 | 7.06 | 7.22 | 10.25 | 16.39 |

At 3 Mbps, the browser's constant and variable modes produced identical H.264
video packet data. Constant mode with realtime latency yielded 2.97 Mbps and
only 56 frames. YAFFW's existing downscale options yielded 3.20 Mbps at 1440p60
and 3.09 Mbps at 1080p60, each with all 242 frames.

An explicit native VideoToolbox rate limit reached 2.86 Mbps at 4K60 with all
242 frames. With only `-b:v 3M`, the same native encoder yielded 8.08 Mbps.
These probes measured the video stream with audio disabled.

```sh
ffmpeg -i input.mp4 -an -c:v h264_videotoolbox -profile:v high \
  -b:v 3M -maxrate 3M -bufsize 6M output.mp4
```

## Mediabunny patch

Mediabunny's public Conversion `frameRate` option retimes frames. The patch
for 1.65.2 uses a bounded timestamp sample starting at the Selection to
estimate cadence for an explicit video bitrate. It supplies that estimate
only to the encoder. Recheck this behavior when upgrading Mediabunny.
