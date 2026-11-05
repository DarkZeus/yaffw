# Remove the eager scrub keyframe index — #122

## Decision

Adopt direct Mediabunny 1.65.2 key-packet lookups after target-packet lookup.
Remove the application background keyframe traversal, second packet sink,
retained timestamp array, timer yields and swallowed scan-failure path.
Keep per-GOP sample-iterator reuse, decoded cache limits, exact-target
presentation, interactive settle delay, native playback ownership and latest
request/disposal guards. This preserves ADR-0011/0012/0013/0015/0017/0018.
Prerequisite #117 is complete. No additional issue is included.

The [upstream sparse-keyframe fix](https://github.com/Vanilagy/mediabunny/issues/621)
supports testing the direct path; it alone does not establish index redundancy.
The application comparison below establishes the local adoption decision.

## Method and results

Ran on Chromium 155.0.8059.85 (installed Brave, headless), Mediabunny exactly
1.65.2, through the existing Vite origin at 127.0.0.1:3000. Baseline is commit
234286135b2c2af3272ec94fc4a4392fd607e792. Source, target sequence, dimensions,
dependency, decoding, packet options and observer are identical between variants;
only index construction/use is removed. There are 48 fresh sessions: four
fixtures × immediate/prepared × indexed/direct × three repetitions, alternating
variant order. Raw browser observations and fixture hashes are in
[scrub-index-evidence.json](scrub-index-evidence.json); reproduction and metric
semantics are in [the runner README](../../verification/scrub-index/README.md).

Medians across three sessions; source reads are decimal MB for the complete seek
sequence, including preparation, prefetch and repeated ranges:

| Fixture | Preparation | First frame indexed/direct (ms) | Source reads indexed/direct (MB) |
| --- | --- | --- | --- |
| 600s MP4, 10s GOP | Immediate | 49.0 / 73.9 | 1.66 / 1.94 |
| 600s MP4, 10s GOP | Prepared | 22.5 / 26.7 | 1.99 / 2.73 |
| 61s MP4, 20s GOP | Immediate | 97.6 / 98.8 | 1.03 / 1.03 |
| 61s MP4, 20s GOP | Prepared | 38.8 / 40.0 | 1.03 / 1.03 |
| 600s MKV, 60 cues | Immediate | 31.2 / 83.0 | 10.83 / 2.94 |
| 600s MKV, 60 cues | Prepared | 21.9 / 24.4 | 11.09 / 1.82 |
| 600s MKV, first cue only | Immediate | 32.3 / 89.2 | 11.09 / 10.24 |
| 600s MKV, first cue only | Prepared | 21.9 / 32.3 | 11.16 / 10.24 |

Every final request in the direct variant completed within 146.3 ms. The warm
cached return medians rounded to 0.0–0.1 ms for both variants. All 288 sequential
frame callbacks matched independent ffprobe presentation timestamps and reference
pixel hashes. Each session's rapid reversals published only the latest target;
no frame published after disposal. Deterministic tests additionally block packet,
key-packet and sample operations to prove in-flight stale-result suppression and
sample/input/iterator cleanup.

The ten-minute MKVs have 6,000 video packets, 60 keys and 1,020 clusters;
the modified fixture has only the first cue. Both have identical byte lengths
and unchanged cluster offsets. All four fixture hashes repeat across independent
generation runs. The baseline retains 60 numeric timestamps on long inputs and
four on the short input (at least 480/32 bytes of numeric payload, excluding array,
closure and engine overhead). Direct retains no application index. The existing
96 MiB provider cache and 48 MiB viewer cache budgets are unchanged, as are
Mediabunny's own caches. No total-heap reduction is claimed.

The repeatable advantage is avoiding eager whole-MKV traversal on normal sparse
cues: roughly 73–84% fewer source bytes for these seek sequences. MP4 reads vary
with prefetch and are sometimes higher without the index. A first-cue-only file
still requires a near-full scan for its first late target. Direct lookup adds
tens of milliseconds to some cold requests; it is not a universal speedup.
The adoption judgment accepts those measured sub-150 ms final requests and
near-identical warm returns in exchange for eliminating the eager scan and its
resource lifecycle. This is a fixture-based decision, not a universal latency SLA.

## Integrated verification

[Live app evidence](scrub-index-app-evidence.json) covers all three ten-minute
fixtures: actual import, playback/pause, late keyboard seeks and frame stepping,
rapid forward/backward movement, visible decoded-scrub canvas matching fresh
reference pixels at the final target and after replacement, confirmed
Close file and replacement with the short fixture. No page errors occurred.
Paused scrubbing is checked through the playhead/canvas; native video need not
seek until playback resumes under the existing Preview contract.

Required checks passed: `npm run typecheck`, `npm run test` (75 files, 656 tests),
`npm run build`, the verification TypeScript scope, affected production Biome,
and the complete verification directory's Biome check. Existing undecodable,
missing-track, cache eviction, native handoff and asset cleanup tests remain.
The new warm test asserts no first/next-key traversal occurs without a request.

## Limits

These are ten-minute low-resolution synthetic CFR recordings, not multi-hour
high-bitrate recordings, physical display timing, Firefox/Safari, or total
browser heap measurements. The comparison measures the actual production scrub
adapter; its post-trial pixel reference shares Mediabunny decoding, while timestamp
truth comes from ffprobe. This does not prove every decoder or container correct.
The existing nominal-frame cache can collide for distinct tightly spaced VFR
samples; this evaluation neither changes that policy nor claims VFR frame-identity
coverage. No export boundary or A/V precision claim follows from scrub results.
There is no remaining blocker for the measured index-removal outcome.
