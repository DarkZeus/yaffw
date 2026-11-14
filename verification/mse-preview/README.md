# Original-quality MSE preview

Start Vite with `pnpm dev` and open
[the prototype](http://localhost:3000/verification/mse-preview/).
Select the original MP4 and use the native player to play and seek. The worker
reads the file on demand with Mediabunny, remuxes one video keyframe interval at
a time, and transfers the fragmented MP4 to the page. The worker checks each
fragment's media payload byte-for-byte against the original packets before
sending it. The browser decodes H.264 and AAC for playback.

The prototype uses separate video and audio SourceBuffers. It appends video in
8 MiB slices and removes past groups of pictures as playback advances. For a seek
outside the current buffer, it starts again from the nearest preceding
keyframe. The 144 MiB budget counts appended video fragment bytes before
eviction. The worker's current fragment, browser-internal allocations, decoded
frames, and audio are outside this count.

This page tests a zero-based H.264 MP4 video track with optional primary AAC
audio. Each video keyframe interval must fit within 112 MiB. It uses the media
element's own playback clock. YAFFW's audio mixer and editor transport are
outside this proof.

## Reproduce the trailer trial

Use an installed Playwright package, a Chromium binary with H.264 support, and
`ffprobe` on PATH.

```sh
export YAFFW_PLAYWRIGHT_PATH=/absolute/path/to/playwright
export YAFFW_BROWSER_EXECUTABLE=/absolute/path/to/chromium
node verification/mse-preview/check.mjs \
  "$HOME/Downloads/S2_DLC1_Story_Trailer _ESRB_H264_4K_60fps_600mbps.mp4"
```

`YAFFW_ORIGIN` overrides the Vite origin. `YAFFW_HEADED=1` shows the browser.
`YAFFW_SEEK_ONLY=1` skips the full-length playback for seek debugging.
The runner writes a JSON report under `tmp/mse-preview/`, including the final
presented frame, browser frame-drop counters, playback events, buffer accounting,
and the time from each seek to the requested frame. It selects cold seek targets
using the original file's highest-bitrate seconds by region.

## Results on the original trailer

On Apple M4, Brave 155 reached the actual last frame at 93.467 seconds and
played through the audio tail. The full run compared all 5,609 H.264 and 4,384
AAC packets byte-for-byte. The largest keyframe interval carried 97.2 MiB of
video, and the peak accounted video buffer stayed within the 144 MiB cap.

The run had three rebuffer events and the browser counted 42 dropped frames
(0.75%). It failed the uninterrupted-playback gate. Five cold seeks landed on
the requested frame in 449–663 ms, including at 70.55 seconds in the trailer's
highest-bitrate second (786 Mb/s).

Headless Chrome for Testing 151 also played the full trailer and verified the
same packets. It reported zero rebuffer events, seven dropped frames (0.12%),
and one 133 ms gap between video-frame callbacks. The strict check allows up to
100 ms between callbacks. Five cold seeks landed on the requested frames in
457–665 ms.

The cold-seek check runs with playback paused and uses the timestamps reported
by `requestVideoFrameCallback`. These results cover the original trailer on
one Mac. The standalone trial uses native audio.

## Results on smaller files

Two synthetic 12-second H.264 MP4s played through in headless Chrome for
Testing 151. Neither rebuffered or had a gap over 100 ms between frame
callbacks. The prototype checked the copied video and presented audio packets
against the source bytes. The AAC file's priming packet precedes time zero.

| Clip                   |   Size | Average bitrate | Dropped frames |
| ---------------------- | -----: | --------------: | -------------: |
| 1080p30 with AAC audio | 9.8 MB |        6.5 Mb/s |       0 of 360 |
| 720p60, video only     | 4.8 MB |        3.2 Mb/s |       1 of 720 |

All six cold seeks presented a frame within one frame of the requested
timestamp in 19–29 ms.

## Editor integration

The editor uses MSE by default for supported H.264 MP4s with AAC or no
audio, at any bitrate. Support depends on the browser and whether the worker
can remux the source. The editor uses a direct file URL when MSE is unavailable
or fails. The Preview audio engine and decoded Scrub preview use the original
file.

To verify the editor, pass the original trailer and a lower-bitrate H.264 MP4
to `node verification/mse-preview/app-check.mjs`. The runner checks MSE playback
through the trailer's final frame, seeks through the editor controls, closes
the trailer and plays the lower-bitrate clip through MSE. It then exercises
direct playback with MSE support disabled. The report is
`tmp/mse-preview/editor.json`.

In an isolated Chrome for Testing 151 run, the editor presented the last
trailer frame at 93.467 seconds with zero dropped frames and zero rebuffer
events. Three forward and backward seek checks presented within one frame of
the target. The 6.5 Mb/s replacement also played through MSE. Direct file
playback passed with MSE support disabled. A concurrent run with the unit suite
reached the end but reported playback interruptions.
