# Measurement checkpoint: 2026-11-20

This is a fixed evidence window, not a claim that the requested two-week observation is complete. [measured-runs.json](measured-runs.json) retains every available Verify run, full SHA, URL, event, conclusion, check timestamp, attempt, resource/cache observations and phase timings. All samples are attempt 1. The original eight-run audit remains in [README.md](README.md).

## Before / current

Comparable baseline = the two original full-contract push runs; current = the one push on the final scheduling configuration (`a0045cb`). Tiny-sample empirical percentiles are shown for reproducibility, **not** a reliable tail estimate. Manual dispatch commit age is excluded from commit-feedback statistics. API timestamps resolve to one second.

| Metric, seconds (p50 / p95) | Before, n=2 | Current push, n=1 |
| --- | ---: | ---: |
| Commit → actual full Verify check reported | 218.00/252.20 | 106.00 / 106.00 |
| Run created → actual check reported | 204.50/236.45 | 63.00 / 63.00 |
| Workflow finalization after required check | 1.00 / 1.00 | 1.00 / 1.00 |

The earlier report used workflow `updated_at`; the actual required-check completion is one second earlier on these three runs. No check is enforced by branch protection today. Current commit-to-creation delay is 43s, including the real 34.75s full pre-push hook. Omitting that delay would misstate commit feedback.

| Current phase | Seconds | Explicit phase budget |
| --- | ---: | ---: |
| root-format | 0.930 | 2 |
| root-lint | 1.813 | 4 |
| editor-typecheck | 1.329 | 5 |
| editor-build | 2.025 | 5 |
| tests | 17.972 | 30 |
| landing-format | 0.510 | 3 |
| landing-lint | 1.100 | 5 |
| landing-typecheck | 3.902 | 10 |
| landing-build | 1.581 | 50 |
| landing-smoke | 27.434 | 35 |

Current editor/landing queue = 2/2s; full setup including job provisioning and checkout = 18/17s; execution = 25/34s (step timestamps; instrumented command totals 25.136/34.580s); aggregate queue = 2s; required-check reporting after job completion = 0s at API resolution. Total runner wall time = 107s across the two lanes and aggregate, versus 63s elapsed run-to-result. Actual API billable compute = 0ms. The [latency audit](https://github.com/DarkZeus/yaffw/actions/runs/44781713200) correctly failed the two setup budgets while [Verify](https://github.com/DarkZeus/yaffw/actions/runs/44781530345) passed all correctness and phase budgets.

**Unmet:** one-minute commit p50 (observed 106s), established two-minute p95, setup p95 <15s, longest-lane p95 <35s across cold/warm conditions, root lint <1s, eligible-PR cache >95% (PR n=0), two-week test-value observation, pre-integration enforcement and demonstrated exclusive production gating. Warm landing execution meets 35s in this push; the current manual modules-miss run takes 42.62s and cold transforms previously take 64.84–77.87s. Performance failures are visible; no correctness is dropped to meet a target.

## All available run outcomes

Snapshot: 24 Verify runs, 2026-11-07T21:54:01Z–2026-11-20T17:37:27Z (creation timestamps).

| Event | Success | Failure | Canceled |
| --- | ---: | ---: | ---: |
| push | 12 | 2 | 0 |
| pull_request | 0 | 0 | 0 |
| workflow_dispatch | 4 | 6 | 0 |

Repeated SHAs are intentional manual cache/image/checkout experiments, not duplicate push/PR feedback. No automatic retry converted a failing run into success. Failed experiments retain their original outcome.

| Run | SHA | Event / result | Created → required result (s) |
| --- | --- | --- | ---: |
| [44785065118](https://github.com/DarkZeus/yaffw/actions/runs/44785065118) | `a0045cbfcf638980dbd05e93fedfc81ae1cabf2c` | workflow_dispatch / failure | 68.0 |
| [44783073667](https://github.com/DarkZeus/yaffw/actions/runs/44783073667) | `a0045cbfcf638980dbd05e93fedfc81ae1cabf2c` | workflow_dispatch / success | 76.0 |
| [44781530345](https://github.com/DarkZeus/yaffw/actions/runs/44781530345) | `a0045cbfcf638980dbd05e93fedfc81ae1cabf2c` | push / success | 63.0 |
| [44779027829](https://github.com/DarkZeus/yaffw/actions/runs/44779027829) | `61867c3019fc3aa46d7c2ac8817fd5cf54ba2b59` | workflow_dispatch / failure | 84.0 |
| [44779020807](https://github.com/DarkZeus/yaffw/actions/runs/44779020807) | `61867c3019fc3aa46d7c2ac8817fd5cf54ba2b59` | workflow_dispatch / success | 88.0 |
| [44779014367](https://github.com/DarkZeus/yaffw/actions/runs/44779014367) | `61867c3019fc3aa46d7c2ac8817fd5cf54ba2b59` | workflow_dispatch / failure | 79.0 |
| [44776985510](https://github.com/DarkZeus/yaffw/actions/runs/44776985510) | `61867c3019fc3aa46d7c2ac8817fd5cf54ba2b59` | push / success | 126.0 |
| [44776654736](https://github.com/DarkZeus/yaffw/actions/runs/44776654736) | `92b8391145f32de1a5a412f49a0e679eb5e2c49b` | workflow_dispatch / success | 80.0 |
| [44776649396](https://github.com/DarkZeus/yaffw/actions/runs/44776649396) | `92b8391145f32de1a5a412f49a0e679eb5e2c49b` | workflow_dispatch / success | 67.0 |
| [44775996256](https://github.com/DarkZeus/yaffw/actions/runs/44775996256) | `92b8391145f32de1a5a412f49a0e679eb5e2c49b` | push / success | 110.0 |
| [44772842107](https://github.com/DarkZeus/yaffw/actions/runs/44772842107) | `ff9abe98d21610ea999ed36472ed578fa8be4eab` | workflow_dispatch / failure | 100.0 |
| [44772836604](https://github.com/DarkZeus/yaffw/actions/runs/44772836604) | `ff9abe98d21610ea999ed36472ed578fa8be4eab` | workflow_dispatch / failure | 101.0 |
| [44772641293](https://github.com/DarkZeus/yaffw/actions/runs/44772641293) | `ff9abe98d21610ea999ed36472ed578fa8be4eab` | push / failure | 120.0 |
| [44769323021](https://github.com/DarkZeus/yaffw/actions/runs/44769323021) | `cbf4d13f13b4ed03911999303823feee3c3039e9` | workflow_dispatch / failure | 114.0 |
| [44769300325](https://github.com/DarkZeus/yaffw/actions/runs/44769300325) | `cbf4d13f13b4ed03911999303823feee3c3039e9` | push / failure | 146.0 |
| [44767503146](https://github.com/DarkZeus/yaffw/actions/runs/44767503146) | `5863ead638994b4aab31c23a43d81db02eb81b54` | push / success | 565.0 |
| [44764587232](https://github.com/DarkZeus/yaffw/actions/runs/44764587232) | `5e2dd0082aa919a15a03717e2a94250425da25fb` | push / success | 169.0 |
| [44752170299](https://github.com/DarkZeus/yaffw/actions/runs/44752170299) | `707ef556e45d89e7f1ebf5d99cae1c3a0e8d64b4` | push / success | 240.0 |
| [44597712994](https://github.com/DarkZeus/yaffw/actions/runs/44597712994) | `91c4b37b323f0e2e3cf923dc18df9291e2c731cd` | push / success | 50.0 |
| [43624350891](https://github.com/DarkZeus/yaffw/actions/runs/43624350891) | `16fe312b5f893e04989dae0d75ecf401c967c115` | push / success | 47.0 |
| [43622470122](https://github.com/DarkZeus/yaffw/actions/runs/43622470122) | `2353b228c450e54b61cf2e36bb5044ed177a5e1c` | push / success | 40.0 |
| [43620260538](https://github.com/DarkZeus/yaffw/actions/runs/43620260538) | `0df352932b3e2ae67d2dbec270458448690df06c` | push / success | 45.0 |
| [42418179456](https://github.com/DarkZeus/yaffw/actions/runs/42418179456) | `8bdeef5f4f75aa3b75e26759c0be807163f35a01` | push / success | 43.0 |
| [42418035348](https://github.com/DarkZeus/yaffw/actions/runs/42418035348) | `b58ef8dd724c2b78f9cf7bfff272c5bba5dbade5` | push / success | 48.0 |

## Benchmark decisions

| Experiment | Observed evidence | Decision |
| --- | --- | --- |
| Matching official Playwright image vs host | Same SHA `cbf4d13`: container initialization alone 27s, then setup 11.62s; all correctness passed, root-lint budget failed. Host also failed; evidence is retained. | Keep hosted image with preinstalled libraries/fonts, exact shell installation and actual launch/font validation. |
| Shallow vs blobless | Same SHA `61867c3`: warm store shallow setup editor/landing 13.86/28.49s; blobless 12.52/34.50s, including working-tree blob fetch. Both performance gates failed under overlap; no reliable isolated winner. | Keep depth-1 shallow; there is no diff selection requiring history. |
| pnpm store vs installed modules | Same SHA `61867c3`: store exact hits 2/2 jobs, setup 13.86/28.49s; modules misses 2/2, setup 13.35/32.81s. Later current-SHA modules misses 2/2: 10.78/16.56s. Exact runner-image/Node keys prevent unsafe approximate reuse. | Keep portable content-addressed store, always frozen-install and allocate native canvas; report cache misses rather than calling them restore wins. |
| Same-job landing build→smoke vs transfer | [44777582348](https://github.com/DarkZeus/yaffw/actions/runs/44777582348), SHA `61867c3`: producer builds once; consumer setup 18.298s, transfer/hash/extract 0.628s, smoke ~28.1s; overall 84s plus source-commit age excluded. | Keep smoke with its one production build; a sub-second transfer does not offset another consumer setup/queue. |

Current successful store push: dependency hits 2/2, Chromium 1/1 eligible landing job, image transforms 1/1. Baseline store hits 4/8 overall and 1/2 equivalent full-contract runs. This observed 100% warm sample is **not** the eligible-PR >95% guarantee (no PR observations). Cold-cache full suites and all browser contracts pass; some cold runs fail only their performance budgets and remain red. Caches save only from successful full master contracts, never from failed peers or PRs.

## Completeness, failures and deployment proof

The baseline 52 files / 347 tests remain; final discovery is 55 files / 355 tests, adding only three infrastructure files (eight cases). Every full run records discovery and checks actual executed filenames exactly once, rejects pending/todo/failed tests and records shuffled seed. All ten canonical phases run across the two hosted jobs. All five browser scripts run against one production build. No selection or sharding is implemented; every input falls back to full verification, so selection false-negative validation is inapplicable. Existing standalone diagnostic gaps are listed in the main audit.

[Aggregate failure probes](aggregate-probes.json) show only success/success returns zero; failure/cancel/skip/missing results cannot turn green. [Staged-hook proof](staged-hook-proof.json) records a 3.175s real partial-staging/space-in-path/Astro fixture; deliberate lint failure and overlapping-hunk conflict restored bytes and returned nonzero. Dirty/wrong-ref/wrong-SHA pre-push probes reject before verification. The real full pre-push hook remains ~35–41s and checks clean HEAD again afterwards.

[Artifact integrity probes](artifact-integrity-proof.json) exercised the actual immutable archives from run 44781530345: original passed, corrupt bytes/wrong run/stale revision failed. Download ZIPs were checked against GitHub artifact SHA-256 metadata. Both exact archives passed pinned Wrangler dry-run (29 editor / 31 landing asset files), without rebuilding or any production write. Production deployment remains disabled; the [account/policy action list](README.md#remaining-account-and-policy-actions) is required before claiming protection.

The fixed gesture/scroll readiness defects are classified as test change detectors, not demonstrated caught product regressions. A residual native-transition failure remains unresolved (below). Observation is less than one day; see [test-failure-observations.md](test-failure-observations.md). No test was deleted, retried automatically, skipped or weakened.

## Cost evidence and storage assumptions

Baseline eight jobs: 659s total runner wall time (10.98 minutes), 688s summed created→workflow-finalized time; illustrative per-job ceiling = 13 minutes. Latest push: 107s total runner wall time (1.78 minutes), 64s workflow elapsed (63s required-result elapsed), illustrative per-job ceiling = 3 minutes. For the two equivalent old full runs, runner wall time was 166/237s; these are the relevant old per-run comparisons, not the eight-run sum. GitHub timing API bills **0ms before and after**; these are public standard hosted runners, so observed compute cost and projected incremental monthly compute are **$0**, not a paid-runner quote. Auxiliary latency-audit/benchmark runs add wall time and currently $0 standard compute; they are separate from Verify timings. No paid service or runner was enabled.

Production ZIP artifacts measured 3,674,804 bytes/run with one-day retention; diagnostic evidence is conservatively ~0.3 MB/run with 14-day retention. At 1,000 runs/month, assuming uniform arrivals, retained storage is about 122.5 MB + 140 MB = 262.5 MB. This is an estimate, not an invoice, and assumes existing included public Actions allocation; archive size/plan usage can change. Cache storage uses a separate quota. Cloudflare invoice, savings from disabling independent builds and private/paid account charges are unknown; no account spend was increased. The exact remaining actions and cost assumptions are consolidated in the main report.

## Residual native-transition failure

The subsequent [installed-cache measurement 44785065118](https://github.com/DarkZeus/yaffw/actions/runs/44785065118), on unchanged SHA `a0045cbfcf638980dbd05e93fedfc81ae1cabf2c`, failed the application-runtime-error assertion in the storage-unavailable navigation scenario: Chromium 158 emitted `Transition was aborted because of invalid state. ViewTransition opt-in disabled`. Both dependency restores missed the exact runner-image key; all other phase correctness passed. Smoke completed the independent scripts and the required aggregate failed; no cache was seeded. This failed sample remains red and is not replaced with a rerun success.

Ranked hypotheses were reveal-before-load readiness, interrupted native transition and storage-induced page-script behavior. Local probes drove 40 header navigations and 32 header/footer navigations on the existing production build under 4× CPU throttling with lifecycle tracing; neither reproduced the abort. Thus its cause/fix is **unproven**. No runtime error is filtered, no assertion is removed and no timeout/retry is added. Awaiting the currently active transition reduced earlier races but is not proven sufficient for this residual failure. Chrome documents that [pagereveal precedes the first rendering opportunity and exposes the inbound transition](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document); that is diagnostic context, not evidence that the first hypothesis caused this run. A further manual installed-cache sample measures exact cache restoration and cannot erase this failure.
