# Final measured CI results — 2026-11-20

Fixed measurement window: 2026-11-07T21:54:01Z–2026-11-20T17:51:27Z (run creation). Requested 150 historical runs; only **8 existed initially**. This final snapshot contains **27** original plus audit-generated Verify runs, all attempt 1. [Raw evidence](measured-runs.json) retains full SHAs, links, events, outcomes, step/check timestamps, resources, cache observations and measured phases. No artificial 150-run sample was created. Report-publication commits after this window are validated separately and do not rewrite this frozen comparison.

## Outcome and limitations

Latest corrected source [`363030f`](https://github.com/DarkZeus/yaffw/actions/runs/44787271673) passed the full hosted contract: **55 files / 355 tests**, all five browser scripts including the added CSS-delivery regression, and final `verify`. Commit→actual required-check result = **109s**; created→result = **61s**. Full real pre-push = **34.65s**. The [separate latency audit](https://github.com/DarkZeus/yaffw/actions/runs/44787439230) correctly failed because landing setup was **15s**, against a strict **<15s** target. Editor setup/execution = 13/34s; landing = 15/31s; both queues and aggregate queue = 2s; final check reporting = 0s at API resolution.

**Unmet:** commit p50 <60s; observed cold/warm p95 <120s; setup p95 <15s; longest-lane p95 <35s; consistent root format/lint <1s; eligible-PR cache >95% (PR n=0); two-week failure-value observation (<1 day completed). Tail estimates are not established from tiny samples. Master is still unprotected; Cloudflare can still deploy independently. The prepared production gate is disabled and is not a demonstrated production guarantee. [Exact remaining account/policy actions and costs](README.md#remaining-account-and-policy-actions) are consolidated in one list. No account settings, secrets, spending or branch policy were changed.

## Comparable before / after

Before = both original full-contract push runs (earlier six omit browser/Astro gates). After = **every push since the two-job architecture**, including cold caches and one failed navigation run, not only green/warm samples. The cache keys and short-check scheduling evolved during this five-run after window; latest-source n=1 is shown separately. Current coverage is stronger (eight added infrastructure cases and an added browser regression), with all original checks retained. Linear interpolated empirical percentiles; one-second API resolution. Commit time is client-supplied GitHub head-commit metadata. Manual-dispatch commit age is excluded.

| Seconds, p50 / p95 | Before n=2 | After n=5, 4 green / 1 red | Latest corrected source n=1 |
| --- | ---: | ---: | ---: |
| Commit → required check reported | 218.00 / 252.20 | 121.00 / 170.80 | 109.00 |
| Run creation → required check reported | 204.50 / 236.45 | 69.00 / 122.80 | 61.00 |
| Worst lane queue | 3.00 / 3.00 | 2.00 / 2.80 | 2.00 |
| Worst full setup, provisioning + checkout included | 64.00 / 85.60 | 19.00 / 21.00 | 15.00 |
| Longest execution lane | 131.00 / 139.10 | 40.00 / 75.40 | 34.00 |
| Total runner wall time, not elapsed latency | 201.50 / 233.45 | 108.00 / 151.20 | 108.00 |

The actual check completion replaces the earlier workflow `updated_at` proxy; final workflow completion is one second later on the latest run and both comparable old runs. No GitHub check is enforced by protection today: “required result” means completion of the complete Verify contract. The latest commit-to-run-created delay is 48s, including the real 34.65s pre-push; hiding it would misstate commit feedback. Quantiles of individual phases do not add to end-to-end quantiles.

| Comparable push run | Full SHA | Outcome | Commit→check (s) | Created→check (s) |
| --- | --- | --- | ---: | ---: |
| [44752170299](https://github.com/DarkZeus/yaffw/actions/runs/44752170299) | `707ef556e45d89e7f1ebf5d99cae1c3a0e8d64b4` | success | 256 | 240 |
| [44764587232](https://github.com/DarkZeus/yaffw/actions/runs/44764587232) | `5e2dd0082aa919a15a03717e2a94250425da25fb` | success | 180 | 169 |
| [44775996256](https://github.com/DarkZeus/yaffw/actions/runs/44775996256) | `92b8391145f32de1a5a412f49a0e679eb5e2c49b` | success | 158 | 110 |
| [44776985510](https://github.com/DarkZeus/yaffw/actions/runs/44776985510) | `61867c3019fc3aa46d7c2ac8817fd5cf54ba2b59` | success | 174 | 126 |
| [44781530345](https://github.com/DarkZeus/yaffw/actions/runs/44781530345) | `a0045cbfcf638980dbd05e93fedfc81ae1cabf2c` | success | 106 | 63 |
| [44786082460](https://github.com/DarkZeus/yaffw/actions/runs/44786082460) | `40053880cb4de8a981a5e0eb237c2b8f9be3ee01` | failure | 121 | 69 |
| [44787271673](https://github.com/DarkZeus/yaffw/actions/runs/44787271673) | `363030fc331176047e99e179c2ac63b24e3c3be3` | success | 109 | 61 |

## Execution phases and budgets

Before values use timestamped serial script-start intervals including process handoff, not CPU time. After values use explicit command timers for the three push runs with serial short editor checks (n=3, one navigation failure included); the last adds the new browser regression. These are execution measurements, not proof of a stable tail. Historical setup components and unavailable timing boundaries are separately documented in the main audit.

| Phase | Before p50 / p95 (s), n=2 | After p50 / p95 (s), n=3 | Latest (s) | Enforced phase budget (s) |
| --- | ---: | ---: | ---: | ---: |
| root-format | 1.24 / 1.31 | 0.93 / 1.27 | 1.307 | 2 |
| root-lint | 2.31 / 2.45 | 1.81 / 2.45 | 2.518 | 4 |
| editor-typecheck | 1.90 / 2.21 | 1.33 / 2.01 | 2.087 | 5 |
| editor-build | 2.18 / 2.27 | 2.03 / 2.27 | 2.300 | 5 |
| tests | 21.49 / 22.75 | 17.97 / 24.17 | 24.858 | 30 |
| landing-format | 0.68 / 0.72 | 0.51 / 0.67 | 0.494 | 3 |
| landing-lint | 1.55 / 1.65 | 1.10 / 1.36 | 1.025 | 5 |
| landing-typecheck | 5.22 / 5.56 | 3.90 / 5.15 | 3.334 | 10 |
| landing-build | 39.42 / 42.18 | 1.58 / 1.99 | 1.439 | 50 |
| landing-smoke | 53.76 / 57.01 | 27.43 / 29.57 | 24.736 | 35 |

Phase overruns fail Verify after all independent evidence completes; local verification reports budgets and enforces correctness. The separate read-only latency audit visibly enforces queue/setup/lane/end-to-end targets without truncating checks or replacing correctness. Setup comparisons include provisioning and later blob fetch; matching official-container initialization alone cost 27s and was not omitted. The original two full runs spent Chromium/system setup 42.00/54.60s p50/p95; the latest no-apt setup launches the same pinned headless shell and validates actual libraries/fonts.

### Setup component observations

All five after push runs; per-job samples include cold misses. Composite action duration records include lookup/download/extraction, not only the install command. They omit job provisioning/outer handoff, which remain included in the full-setup table above. Before Node/store and browser/system dependencies were combined; their separate old durations remain unknown. [Raw component observations](setup-components.json).

| After component | n | p50 (s) | p95 (s) |
| --- | ---: | ---: | ---: |
| Checkout (including working-tree blobs) | 10 | 1.500 | 2.000 |
| pnpm setup | 10 | 1.056 | 1.464 |
| Node setup (store restore separate) | 10 | 0.511 | 2.912 |
| Dependency restore lookup/download/extract | 10 | 3.296 | 4.295 |
| Frozen install | 10 | 3.688 | 8.512 |
| Native canvas ABI allocation | 10 | 0.265 | 0.345 |
| Chromium restore lookup/download/extract | 5 | 1.362 | 1.956 |
| Exact headless-shell install/validation | 5 | 0.835 | 4.493 |
| Browser launch and fonts proof | 5 | 0.631 | 0.788 |
| Image-transform restore | 5 | 0.452 | 0.880 |

## Cache and execution experiments

| Experiment | Actual observations | Decision |
| --- | --- | --- |
| Official matching Playwright image | Same `cbf4d13` host/container both failed; container all correctness passed but root-lint budget failed. Container initialization 27s + setup 11.62s. | Keep hosted image with preinstalled dependencies, exact shell and actual font/browser validation. No paid runner. |
| Shallow vs blobless | Same `61867c3` warm-store batch: shallow setup editor/landing 13.86/28.49s, blobless 12.52/34.50s including checkout blobs. Both performance gates failed under overlap. | Keep depth-1 shallow; this does not establish an isolated checkout winner. No selection needs history. |
| Store vs installed modules | Same `61867c3`: store hit 2/2, setup 13.86/28.49s; modules miss 2/2, 13.35/32.81s. On `a0045cb`, store hit 2/2: 16.10/16.25s; actual warm modules [44785809793](https://github.com/DarkZeus/yaffw/actions/runs/44785809793) hit 2/2: 10.75/15.80s; frozen install still ran (landing 1.7s), native canvas passed and full contract passed. Different hosted CPU/image variants prevent attributing all timing differences to cache mode. | Store remains default: no reliable end-to-end modules win, and exact-image modules misses are common. Portable store keys bind Node ABI/platform/lock/settings/patch; modules additionally bind exact image/Node patch. |
| Landing artifact transfer | Same `61867c3`, [44777582348](https://github.com/DarkZeus/yaffw/actions/runs/44777582348): production built once; consumer setup 18.298s, transfer/hash/extract 0.628s, smoke ~28.1s, whole experiment 84s. | Keep build→smoke in the same job: transfer does not offset another setup/queue. |

For the five after push runs, exact dependency-cache hits are **6/10 eligible job restores**; browser/image hits are **3/5** and **3/5** respectively, including the initial key-seeding misses. Latest warm push hits dependencies 2/2, Chromium 1/1 and images 1/1. Baseline store hit 4/8 overall, 1/2 equivalent full runs. These are not eligible-PR statistics (PR n=0). Cold-cache correctness passed all assertions/browser contracts, while slower cold performance gates failed visibly where exceeded. Only successful full master contracts seed caches; peer failures/cancels/skips/wrong SHA refuse authorization.

## Completeness and failure behavior

[Measured inventories](current-test-files.txt) prove all original [52 files](baseline-test-files.txt) remain in the current 55; only `release.test.mjs`, `verify-runner.test.mjs`, `wait-editor.test.mjs` were added (eight cases). Discovery is compared with actual executed Vitest filenames exactly once; pending/todo/failure is rejected. CI executes all ten canonical phases, including all prototype/verification tests. Every run records a reproducible shuffle seed. All five browser scripts remain; the navigation script now additionally checks opt-in without external CSS. Existing standalone diagnostic gaps are documented, not silently described as canonical tests.

No changed-test selection or sharding is implemented: all inputs get full verification. Selection false-negative experiments are inapplicable; no selected green status exists. No test deletion, automatic test retry, widened timeout, weakened assertion or disabled worker isolation was used. The final aggregate [failure probes](aggregate-probes.json) accept only success/success, with actual-script peer-gate tests covering pending/failure/cancel/skip/wrong SHA. Independent phases finish and retain logs on failure. Old red samples remain red.

[Staged-hook proof](staged-hook-proof.json): 3.175s real partial-staging/space-in-path/Astro fixture; intentional lint failure and overlapping-hunk conflict restored the index and working bytes. Full pre-push is separately measured (~35–41s), verifies clean current master before and after, and rejects dirty/wrong-ref/wrong-SHA candidates. Hooks remain locally bypassable.

## Native-transition diagnosis and proof

Two hosted runs ([44785065118](https://github.com/DarkZeus/yaffw/actions/runs/44785065118), [44786082460](https://github.com/DarkZeus/yaffw/actions/runs/44786082460)) exposed Chromium 158 “ViewTransition opt-in disabled” in storage-unavailable navigation. The complete aggregate failed and caches were not seeded. Initial 4× CPU-throttled probes (40 header and 32 header/footer navigations) did not reproduce it. Provisional-object access alone was an insufficient hypothesis; merely changing that access did not solve the controlled failure.

A delayed-external-CSS fixture then reproduced the exact error: external-only failed, inline-only and inline opt-in + the same external stylesheet passed (eight navigations each). Chromium [resolves inbound opt-in from active styles and skips with `kOptInDisabled`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/view_transition/view_transition_supplement.cc); Chrome documents [pagereveal before the first rendering opportunity](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document). Moving the existing opt-in **and reduced-motion opt-out** inline before external resources fixes that delivery dependency. All animation styling/timing remains external and unchanged.

The deterministic regression aborts incoming external CSS: old build fails native opt-in (`false !== true`), fixed production build passes, and all original browser checks pass. A first 150ms-delay-only regression probe passed the old build and was replaced rather than counted as proof. [Local proof](transition-regression-proof.json), plus the green corrected hosted run above, supports the fix. No runtime error was filtered. Gesture/scroll readiness fixes remain test change detectors; this transition failure exposed production degradation whose introduction date is unknown. [Test-value observations](test-failure-observations.md) cover less than one day, not two weeks; no historical regression-catch rate is claimed.

## Artifact gate and account boundary

[Integrity probes](artifact-integrity-proof.json) used actual immutable archives from 44781530345: original passed, corrupt bytes/wrong run/stale revision failed. Download ZIPs matched GitHub SHA-256 metadata; both exact archives passed pinned Wrangler dry-run (29 editor / 31 landing assets), without rebuild or production write. Lane uploads are candidates; full verification requires both lanes and final aggregate. Optional deployment validates both manifests, independent expected checksums, run/SHA/scope/origin and current remote master before extracting; it deploys those bytes once, without a rebuild.

The production job remains **explicitly skipped**. Master protection is still 404 “Branch not protected” and rulesets empty; direct post-push Actions cannot provide a server-enforced pre-integration gate. Cloudflare Workers Builds remain independent and were observed completing before Verify. Their precise configuration API returns 403; no broad local OAuth secret was exported. Before claiming protection, authorize a candidate-submission/promotion policy, disable both independent deployment paths and alternate credentials, configure scoped production environment secrets, enable the prepared gate and demonstrate that a failed candidate cannot advance production. The [single action/cost list](README.md#remaining-account-and-policy-actions) is the concrete remaining work.

## Cost evidence

Original eight runs: 659s total job wall time (10.98 min), 688s summed workflow elapsed, illustrative per-job ceiling 13 min. Equivalent full-contract old runs were 166/237s job wall time. After five pushes: **613s total runner wall**, empirical per-run p50/p95 **108.00 / 151.20s**. Latest: **108s runner wall** across two lanes + aggregate, versus **61s elapsed to required result** (62s workflow finalization). No skipped deployment time is counted as runner execution.

GitHub timing API reports **0 billable milliseconds before and after**, across all retained Verify runs. This public repository uses standard hosted runners: observed Actions compute cost and expected monthly incremental compute remain **$0** under [GitHub public-runner pricing](https://docs.github.com/en/actions/concepts/billing-and-usage). Auxiliary benchmarks and latency audits add runner wall time but currently $0 standard compute; they are separate from Verify critical paths. No paid runner/service was enabled. Cloudflare invoices or private/paid account charges are unknown, not inferred as zero.

Measured production ZIP artifacts total 3,674,804 bytes/run, retained one day. Diagnostic evidence estimate ~0.3 MB/run, retained 14 days. At 1,000 runs/month uniformly distributed, retained storage is approximately 122.5 + 140 = **262.5 MB**; assumes existing included allocation and unchanged artifact sizes. Cache inventory at this checkpoint: **12 entries / 1,834,924,118 bytes** in its separate cache quota. These are quota/retention estimates, not an invoice; actual account headroom and Cloudflare costs require account review before higher volume. Expected incremental compute before/after is $0, with no spending change authorized or made.

## Complete run inventory

| Event | Success | Failure | Canceled |
| --- | ---: | ---: | ---: |
| push | 13 | 3 | 0 |
| pull_request | 0 | 0 | 0 |
| workflow_dispatch | 5 | 6 | 0 |

Repeated SHAs are intentional manual setup/cache/image/checkout measurements, not duplicate push/PR feedback or automatic retries. Manual commit age is excluded from change-feedback latency; all manual outcomes remain below.

| Run | Full SHA | Event / outcome | Created→check (s) |
| --- | --- | --- | ---: |
| [44787271673](https://github.com/DarkZeus/yaffw/actions/runs/44787271673) | `363030fc331176047e99e179c2ac63b24e3c3be3` | push / success | 61.0 |
| [44786082460](https://github.com/DarkZeus/yaffw/actions/runs/44786082460) | `40053880cb4de8a981a5e0eb237c2b8f9be3ee01` | push / failure | 69.0 |
| [44785809793](https://github.com/DarkZeus/yaffw/actions/runs/44785809793) | `a0045cbfcf638980dbd05e93fedfc81ae1cabf2c` | workflow_dispatch / success | 70.0 |
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
