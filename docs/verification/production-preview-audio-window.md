# Production bounded Preview audio verification — #109

The bounded production contract and the explicitly approved automatic Preview
approximation are implemented. Final verification passes after the sample-boundary
refill regression fix described below.

## Contract and implementation

[Issue #109](https://github.com/DarkZeus/yaffw/issues/109), under parent
[#103](https://github.com/DarkZeus/yaffw/issues/103), adopts the bounded contract
accepted in [#108](./bounded-preview-audio-window.md). The starting revision was
`549a6a3ee961e9d9aaa9bb5897f00c835439bcf9`; these measurements exercise the
integrated working tree, including the user's existing workbench changes.

The production resource hook owns one Mediabunny Input/provider per active
asset. Resources carry track identity and format metadata; they do not retain
full-track AudioBuffers. Concurrent track priming waits for bounded PCM, known
silence, or an explicit failure on every audio track. The controller owns
invalidation and lookahead; the scheduler owns bounded PCM and one-shot sources;
the graph owns channel routing, gains, and meter taps. All tracks share one
AudioContext epoch. Native video follows that audio clock while muted.

The accepted settings remain 2 seconds of media-time lookahead, replenishment
below 1.5 seconds every 50 ms, and chunks no longer than 200 ms. Pause stops
sources and replenishment while retaining the bounded window. Seek, rate and
routing changes replace obsolete generations. Retry reopens only the failed
track. Replacement and teardown cancel iterators, close samples, dispose the
provider/input, stop sources, and release scheduler PCM. Waveform generation
remains an independent worker-backed capability. Export retains its separate
Selection-scoped adapter. The superseded production full-track Preview decode
path is removed; historical benchmarks remain development-only.

## Controlled production browser measurements

Final measurements recorded on 2026-09-07 in the Codex in-app Chromium browser (Chrome 152,
MacIntel user-agent), with Mediabunny 1.52.2 and the user's existing server at
`127.0.0.1:3000`. No development server was started. The physical development
entry is `/verification/preview-audio-production/`, outside the product route
and production build. [Harness instructions](../../verification/preview-audio-production/README.md)
include reproducible fixture preparation and measurement boundaries.

[Raw browser evidence](./evidence/preview-audio-production-2026-09-07.json)
contains five independent 30-second production trials, the 12 functional
checks, six offset/silence probes, errors, and cleanup counters. All sections
passed and the errors array is empty. Earlier runs interrupted by Vite reloads
or closed browser tabs were discarded. The final run kept the page open and
retained each completed trial; no source edits occurred during it. The browser
download did not complete, so the DOM-rendered JSON was transferred losslessly
through gzip/base64 and verified by decompression with its checksum. The
[initial 2026-09-06 evidence](./evidence/preview-audio-production-2026-09-06.json)
predates the refill-boundary correction and is retained only as historical evidence.

The 120-second fixture is 3,998,229 bytes, with two distinct stereo AAC tracks
at 48 kHz. SHA-256:
`75d390a7cf42f52b6360c28d8408447075742720bc3f7b3e31d467eab613400a`.
This is the same fixture recorded by #108. Every trial injects renderer stalls
of 250, 500, and 1,000 ms at elapsed seconds 4, 10, and 18.

| Trial | Ready (ms) | Peak retained PCM (bytes) | Natural 10 ms timer p95 (ms) | Sources/s | Underruns |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 14.5 | 1,656,832 | 11.2 | 11.932 | 0 |
| 2 | 26.3 | 1,650,688 | 11.1 | 11.933 | 0 |
| 3 | 29.4 | 1,687,552 | 11.2 | 11.797 | 0 |
| 4 | 30.9 | 1,687,552 | 11.1 | 11.864 | 0 |
| 5 | 25.8 | 1,685,504 | 11.2 | 12.193 | 0 |

Readiness median is **26.3 ms**, p95 **30.9 ms**. It passes the median <100 ms
and p95 <250 ms gates and improves on both #108 baselines (301.6 ms direct
full-track and 259.0 ms bridge). Every track crossed the readiness barrier.
Peak retained scheduler PCM was **1.61 MiB**, below 2 MiB. Natural timer p95
stayed below 25 ms and source churn below 14/s. Every requested stall was
observed and all five trials reported zero underruns. Scheduled
AudioBufferSourceNode chunks satisfy these gates; AudioWorklet is not triggered.

Readiness includes production metadata preparation, bounded engine priming,
and default mix initialization; fixture inspection/digest happen before timing.
PCM counters measure scheduler-owned AudioBuffers, not decoder-private
allocations or total browser-process memory. Provider counters are cumulative
published PCM, not retained memory. Independent wrappers observe source
creation/disconnect, provider cancellation/disposal, and awaited context close.
Every trial ended with zero retained scheduler PCM, active timers, active
provider generations, and residual source nodes, and one completed Input/provider
disposal and AudioContext close. Unit tests separately verify sample closure
and iterator/Input ownership.

## Functional and application verification

All **12 production functional checks passed**: independent track/master
meters, pre-output metering under global mute, Track volume, isolated monitor
gain, explicit channel routing rebuild, pause/resume, latest seek, rate, clipped
Selection end and wrap, per-track failure/retry, replacement, and teardown.
The measured Selection wrap took **13.8 ms**, below the accepted 100 ms
control-plane budget; meter taps were silent after the clipped boundary.
Failure injection is through an instrumented provider wrapper, while the
engine, routing, scheduling and meters are the production implementation.

All **six offset/silence probes passed** on the independent 12-second fixture:
initial silence, staggered track starts, both tracks playing, second-track
silence while the first continues, recovery, and tail silence after audio ends
while video continues. This fixture contains encoded silence, not missing
packets. Provider tests cover timestamp gaps. The harness README includes
ffprobe timing and independent FFmpeg-decoded RMS evidence.

Separate interactions through the actual editor exercised:

- Importing the long fixture and both independently rendered Waveform lanes.
- Play, pause, seek and 1.5x playback with the native video muted and following
  the audio playhead. One observed sample was 70.492 s on the Preview playhead
  and 70.498262 s on native video.
- Per-track and master meter movement, preview solo isolating the other track,
  global mute preserving pre-output meters, and explicit left-channel centering.
- Keyboard Track volume endpoints: 0% silences the monitored track; 100%
  restores it.
- An excluded track remaining available for preview solo while Export review
  reports one included source track in the generated mix.
- A one-second Selection [109 s, 110 s) looping at 1.5x and remaining within
  that interval over repeated observations.

On 2026-09-07, the approved notice was verified in Audio and Export review with
an eight-second alternating-stereo fixture. At 2.693 s automatic mode produced
equal left/right meter readings (-13.97 dBFS); explicit preserve at 4.624 s
restored one-sided placement (-13.50 / -84.64 dBFS). The notice disappeared
when preserve was selected. Close file then returned the editor to the empty
import state after restoring the default channel mode. The earlier dirty-session
confirmation attempt stalled browser automation; its confirmation behavior is
covered by route cleanup tests. No generated export was rendered in this browser
run; Selection-wide export classification remains covered by the full suite.

## Automated checks

- `npm run test`: **456 tests passed in 67 files** in the user working tree; the isolated
  staged snapshot passes **452 tests in 67 files** without unrelated user edits.
- `npm run typecheck`: passed, including the check invoked by the build.
- `npm run build`: passed; existing Vite bundle-size warning remains.
- Scoped `npx biome check` over 35 affected TypeScript/TSX files: passed.
- Separate TypeScript check for the development harness entry: passed.
- `git diff --check`: passed.
- Focused provider, scheduler, production engine, resource/lifecycle, transport,
  native player, route cleanup, and evidence-gate tests are part of the suite.
- The six-channel automatic-mode regression was first reproduced with a
  failing test (channel count 2 instead of 6), then fixed at graph routing.

The isolated staged snapshot also passes typecheck, production build, and
scoped Biome checks. Seven files shared with pre-existing user work were staged
by applying only this issue’s additions to HEAD; unrelated workbench changes
remain unstaged. The index snapshot is tested separately to ensure the commit
does not depend on those edits.

## Approved decision: Auto-fix quiet side

On 2026-09-07 the user approved a clearly labeled bounded Preview approximation.
Preview classifies each PCM chunk (up to 200 ms); export retains classification
of the complete Selection. Alternating left-only and right-only passages can
therefore be centered individually in Preview while full-Selection analysis
preserves stereo. Audio and Export review visibly explain this difference and
Audio directs users to explicit channel modes for consistent placement.
Regression tests cover alternating passages, explicit preserve mode, and notice
visibility, including omission from Export review when the auto track is excluded.
ADR-0021, ADR-0023 and CONTEXT.md record the approved contract.

## Final review regression

Review found that sample-rounded chunk endpoints can extend beyond an
unrounded publication endpoint. Treating the next adjacent refill as a
replacement could remove an entire scheduled tail chunk, creating silence
that the removed-chunk underrun metric did not detect. Adjacent publications
now append to coverage without replacing prior PCM; actual overlaps and track
failures still stop obsolete sources. A focused regression exercises fractional
48 kHz boundaries, and the complete browser measurement suite passed again after
this correction. Earlier zero-underrun evidence alone did not prove this edge
case; the boundary regression is part of the acceptance evidence.
