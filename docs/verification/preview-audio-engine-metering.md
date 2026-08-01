# Preview audio engine metering verification

Issue #99 was verified on 2026-08-02 in the supported Chromium runtime against the user-owned development app at `127.0.0.1:3000`.

## Live graph behavior

A four-second MP4 with one stereo AAC track was generated with a constant `-6 dBFS` left-channel tone and a silent right channel. With channel handling set to **Keep as recorded**, the Audio panel reported approximately `-6 dBFS` left and the `-90 dBFS` display floor right for both the per-track and combined meters. This demonstrates that the analysers preserve channel separation.

Global preview mute left those readings unchanged. Changing channel handling to **Center left-side audio** changed the per-track display to one mono channel around `-6 dBFS`, while the explicit stereo monitored-output mix showed approximately `-6 dBFS` on both left and right. This demonstrates that the taps follow graph routing and remain before global listening-comfort controls.

## Maximum-practical profile

The current maximum-practical profile is four embedded stereo tracks: eight per-track analyser channels plus two combined-output analyser channels. The fixture used a 160x90 H.264 video track and four continuous stereo AAC tracks at 48 kHz. The Audio panel prepared all four tracks and playback completed normally.

The in-app Chromium automation environment does not expose animation-frame or production performance traces, so the comparison sampled 200 consecutive 10 ms main-thread timers during playback. Absolute timer latency is affected by automation throttling; the relative one-track/four-track comparison is the useful signal.

| Playback setup | Median | p95 | Mean | Samples over 25 ms |
| --- | ---: | ---: | ---: | ---: |
| One stereo track / 4 analyser channels including combined output | 12 ms | 98 ms | 25.05 ms | 44 / 200 |
| Four stereo tracks / 10 analyser channels including combined output | 14 ms | 79 ms | 26.57 ms | 59 / 200 |

The four-track graph added 1.52 ms, or about 6.1%, to mean timer latency, while p95 improved within run variance. No material playback regression was observed at the maximum-practical setup.

An exploratory eight-stereo-track stress run showed background-automation throttling and is intentionally not used as a product performance claim. It remains above the maximum-practical density of the current single-asset Audio panel workflow.

## Automated coverage

The Preview audio engine tests cover graph topology, silent analyser branches, mono, stereo, one-sided and duplicated channel handling, six-channel custom layouts, Track volume and monitoring gains, combined clipping above full scale, unavailable and degraded states, excluded unavailable tracks, retry, seeking, playback-rate changes, pause/stop silence, and analyser cleanup. The existing preview-meter presentation tests continue to cover smoothing, clip hold, and pause/stop decay.
