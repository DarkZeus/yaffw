# Bounded Preview audio window investigation

Issue #108 tests whether Preview can become ready from bounded, playhead-local
PCM and maintain continuous multi-track playback without changing the
production Preview audio resource or engine contracts. The prototype is a
development-only Vite entry outside the product route tree and production
bundle.

## Production isolation

The investigation does not import from or modify the production Preview
player, resource hook, monitoring lifecycle, engine, or resource types. The
current full-track direct path remains the production behavior and the
correctness baseline. A separate issue, #109, owns any production adoption and
the corresponding ADR revisions.

## Fixtures

The controlled performance comparison uses the same file for every strategy
and run:

| Property | Value |
| --- | --- |
| Path during verification | `/private/tmp/yaffw-waveform-106-large-two-aac.mp4` |
| SHA-256 | `75d390a7cf42f52b6360c28d8408447075742720bc3f7b3e31d467eab613400a` |
| Size | 3,998,229 bytes |
| Duration | 120 seconds |
| Video | H.264, 160 x 90, 30 fps |
| Audio | two distinct stereo AAC tracks, 48 kHz, 440 Hz and 880 Hz |

The generation command is recorded in
`docs/verification/worker-waveform-generation.md`.

Correctness checks also use a 12-second MP4 with two mono AAC tracks. Track 1
starts at 0.728 seconds. Track 2 starts at 1.478 seconds and contains encoded
silence from media time 3.478 through 5.478 seconds. Its verification SHA-256
is `da7743ad1ca78fe46881477332be65ac60b730e79657ec575774c3394c0ad5f7`.

## Controlled protocol

Five counterbalanced rounds compare three strategies against the identical
source `Blob`:

1. the bounded playhead-window candidate;
2. the current timestamp-aware full-track direct algorithm;
3. the retired serial same-codec remux, `Blob.arrayBuffer()`, copy, and
   `decodeAudioData()` bridge reconstructed only inside the harness from the
   parent of commit `162df82`.

Every trial uses fresh Mediabunny input and Web Audio state, then tears them
down before the next trial. Raw trials retain readiness, deterministic PCM
payload, decoder work, renderer timer responsiveness, scheduled coverage,
source-node churn, and cleanup counters. Separate fault scenarios cover
pause/resume, seek, playback-rate change, looping, cancellation, stale work,
per-track failure and retry, media replacement, and teardown so fault
injection cannot contaminate timing medians.

## Accepted contract and results

The browser investigation ran on 2026-08-16 in Chromium 151 on macOS with
Mediabunny 1.52.2. The candidate contract is:

- retain one Mediabunny `Input` for the active asset;
- open one sequential sample iterator per audio track and playback generation;
- publish each track as playable PCM, metadata-proven silence, or an explicit
  failure before crossing the shared Web Audio start barrier;
- retain a 2-second PCM window, replenish below 1.5 seconds every 50 ms, and
  batch decoded PCM into chunks no longer than 200 ms;
- schedule every track from one context/media epoch and rate;
- on pause, stop scheduled nodes and suspend pulls while retaining only the
  current bounded window for an exact resume; invalidate and return affected
  iterators on seek, rate change, loop wrap, routing rebuild, retry, media
  replacement, or teardown;
- clip sources exactly at a selection end, then treat wrapping as an explicit
  control-plane discontinuity with a 100 ms maximum wrap budget; steady-state
  playback continuity and loop-wrap latency are separate gates;
- retry only the failed track when the rest of the generation is reusable;
- close every caller-owned `AudioSample`, stop and disconnect every scheduled
  node, release every PCM reference, and dispose the asset input exactly once.

The comparison used 30 seconds of playback per trial. Deliberate main-thread
stalls of 250, 500, and 1,000 ms occurred at playback seconds 4, 10, and 18.
Trial order was counterbalanced so each strategy appeared in each position.
The compact raw record is retained in
`docs/verification/evidence/preview-audio-window-2026-08-16.json`; it identifies
the pre-commit base revision and the accepted browser comparison. The enclosing
commit also adds a deterministic regression for the stricter source-ending
continuity instrumentation applied during final review.

| Strategy | Readiness runs (ms) | Median / p95 (ms) | Median peak PCM | Decoded media per representative run | Underruns |
| --- | --- | --- | --- | --- | --- |
| playhead window | 21.1, 23.7, 24.5, 20.6, 23.3 | 23.3 / 24.5 | 1,687,552 bytes | about 63.4 seconds | 0 |
| full-track direct | five controlled runs | 301.6 / 307.4 | 92,160,000 bytes | 240.0 seconds | 0 |
| retired remux bridge | five controlled runs | 259.0 / 262.0 | 92,176,384 bytes | 240.04 seconds | 0 |

At readiness the candidate retained exactly 1,536,000 bytes: two tracks times
two channels times 48,000 frames times four bytes times the 2-second window.
Its median peak was 98.17% below the current direct path. Median readiness was
92.27% faster than the direct path and 91.00% faster than the retired bridge.
During the 30-second observation it decoded about 73.6% less media than the
full-track baseline; the small amount beyond the 60 seconds required by two
tracks is bounded decoder and scheduling lookahead.

The candidate created 356 to 364 one-shot source nodes per trial, or at most
12.14 nodes per second across both tracks. Peak live nodes were 24 to 26. All
were ended or stopped and disconnected. Natural 10 ms timer p95 was at most
11.1 ms. The only intervals
over 50 ms in candidate trials were the three deliberate stalls, and scheduled
coverage still reported no holes. All 15 trials ended with zero retained PCM,
nodes, and timers and no recorded strategy errors.

The accepted record distinguishes two retained decoder iterators from 55 to 57
window pulls and 356 to 364 published PCM chunks. Candidate provider disposal,
awaited context close, scheduled-node ownership, PCM, timers, and generation
cancellation were observed independently. `AudioSample`, iterator, and
underlying `Input` ownership is asserted by deterministic provider tests. A
two-track PCM regression also verifies that distinct track samples retain
their own identities and route through separate gain/source paths. The
offset/silence fixture then passed all 12 asserted browser lifecycle operations
with final status `ready`, eight generations opened, eight cancelled, one
isolated track retry, one media replacement, zero stale publications, zero
underruns, zero retained PCM after teardown, and a measured 0.3 ms loop-wrap
control gap.

## Decision gates

| Gate | Limit | Observed | Result |
| --- | --- | --- | --- |
| median playhead readiness | below 100 ms and both baselines | 23.3 ms | pass |
| p95 playhead readiness | below 250 ms | 24.5 ms | pass |
| peak retained PCM | at most 2 MiB for this two-track fixture | 1,687,552 bytes | pass |
| continuity | no coverage holes through accepted 1,000 ms stall | 0 underruns in five trials | pass |
| natural renderer timer p95 | at most 25 ms | 11.1 ms | pass |
| source-node churn | at most 14 nodes/second across both tracks | 12.14 | pass |
| selection loop wrap | clip at end and resume within 100 ms | 0.3 ms | pass |
| cleanup | zero residual PCM, nodes, and timers; exact sample/iterator ownership | zero residuals in browser trials and tests | pass |

## Decision

The bounded playhead-window strategy is viable and should be adopted through
#109. It materially reduces readiness time, PCM retention, and decoder work
while preserving timestamp gaps, multi-track alignment, lifecycle behavior,
and continuous steady-state playback under the accepted 1-second
renderer-stall budget. Selection wrapping is explicitly a bounded
control-plane discontinuity in this contract, not a steady-state underrun.

An AudioWorklet is **not required** for the production follow-up. The measured
one-shot node rate stayed below the gate and produced no coverage holes. That
decision should be revisited only if #109 measures underruns within the same
stall budget or source-node churn exceeds the accepted limit after integration.

## Re-running the evidence

With the repository's existing Vite development server already running, open
`http://127.0.0.1:3000/verification/preview-audio-window/`. Select the long AAC
fixture, use **Run 15 trials**, and download the JSON record. The separate
**Run lifecycle/stall scenario** action exercises invalidation, retry,
replacement, and teardown. The page is a physical development-only HTML entry;
it is neither a product route nor a production build input.
