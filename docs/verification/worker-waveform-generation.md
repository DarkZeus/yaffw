# Worker-backed Waveform lane verification

Issue #106 restores dedicated-worker Waveform generation after the previous
worker instantiated Mediabunny `AudioBufferSink`. Chromium does not expose the
Window-only `AudioBuffer` interface in a dedicated worker, so the worker
returned `AudioBuffer is not defined` and the route repeated the complete
decode and bucket scan on the renderer thread.

## Accepted implementation

The worker now consumes worker-compatible Mediabunny `AudioSample` values,
copies each channel as planar float PCM, maps samples into the existing 8,192
buckets by media timestamp, and transfers only the normalized `Float32Array`
result. Every sample is closed after copying, the iterator is returned on every
exit, the Mediabunny input is disposed, and the route terminates the worker and
removes its listeners after success, failure, or cancellation.

A functioning worker's domain-level unavailable result is final. The route
uses current-thread generation only when `Worker` is unavailable, construction
throws, the worker script cannot start, or the initial `postMessage` fails.
This prevents a decodable or domain-level worker failure from silently doing
the same work again on the renderer thread.

## Reproducible fixture

The browser check used a generated 120-second MP4 with 160x90 H.264 video and
two distinct stereo AAC 48 kHz tracks:

```sh
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i 'color=c=black:s=160x90:r=30:d=120' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=120' \
  -f lavfi -i 'sine=frequency=880:sample_rate=48000:duration=120' \
  -map 0:v:0 -map 1:a:0 -map 2:a:0 \
  -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac:a 2 -shortest \
  -metadata:s:a:0 title='Waveform 440 Hz' \
  -metadata:s:a:1 title='Waveform 880 Hz' \
  /tmp/yaffw-waveform-106-large-two-aac.mp4
```

- Size: 3,998,229 bytes
- SHA-256: `75d390a7cf42f52b6360c28d8408447075742720bc3f7b3e31d467eab613400a`
- `ffprobe`: one H.264 video stream and two stereo AAC 48 kHz streams;
  120.000 seconds

## Chromium result

The issue's regression investigation recorded a 340 ms median for Waveform
generation alone and 445 ms while full-track Preview decoding ran concurrently.
Those runs used the broken worker path and therefore performed the decode and
bucket scan on the renderer thread after each worker failed.

On 2026-08-16, the final implementation was exercised through the user-owned
YAFFW development app at `http://127.0.0.1:3000/` in the in-app Chromium
browser. After reloading the application, a probe sampled renderer `Date.now()`
and the visible lane states at a requested 10 ms cadence before and during a
real fixture import.

| Measurement | Result |
| --- | ---: |
| File selection to both lanes ready | 884 ms |
| First visible loading lane to both lanes ready | 639 ms |
| Ready Waveform lanes | 2 |
| Unavailable Waveform lanes | 0 |
| Idle probe interval median / p95 / max | 21 / 23 / 24 ms |
| Active probe interval median / p95 / max | 51 / 95 / 95 ms |
| Active renderer probes served | 13 |

Both lanes completed in workers; with unavailable worker results now final,
the ready states also demonstrate that Chromium did not hit the former
`AudioBuffer is not defined` path or a renderer decode fallback. The renderer
continued serving interaction probes throughout concurrent Waveform and
Preview preparation, with a 95 ms maximum observed probe interval rather than
the earlier complete 340-445 ms renderer-thread decode interval.

The user-owned YAFFW server stopped accepting connections on
`127.0.0.1:3000` before repeat runs could be collected. No replacement server
was started. The numbers above are therefore one reproducible functional and
responsiveness run, not a new latency median or a cross-device performance
claim.

## Automated coverage

`selection-waveform-lanes.test.tsx` covers ready and unavailable results,
worker construction and script-start fallback, cancellation, cache reuse,
media-timestamp projection, multichannel averaging, normalization, sample
closure, iterator return, input disposal, listener removal, and worker
termination. Route cleanup coverage continues to exercise active-asset
replacement and stale completion protection.
