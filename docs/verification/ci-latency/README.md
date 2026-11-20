# CI latency and correctness audit

Audit started 2026-11-20. Work remains on `master`; no branches or account settings are changed. Reproduce the GitHub sample with `python3 scripts/audit-ci.py tmp/ci-audit`. The GitHub connector has job/log readers but no workflow-run listing, branch-protection, ruleset or billing endpoint, so bulk collection uses authenticated `gh`.

## Historical evidence

Requested the last 150 Verify runs with 100-row pagination. GitHub exposes **8 total**, 2026-11-07T21:54:01Z–2026-11-20T15:34:13Z (run creation). All eight are successful `push` runs, attempt 1, on distinct SHAs. PR success/failure/cancellation, push failure/cancellation, duplicate-revision and eligible-PR cache-hit sample sizes are all **0**. This is an inventory, not a statistically reliable p95 estimate. Full SHAs, jobs, step timestamps, runner names, timing API responses and phase observations are in [baseline-runs.json](baseline-runs.json); logs are reproducible and linked through each run.

| Run | SHA | Created→final report (s) | Commit→final report (s) |
| --- | --- | ---: | ---: |
| [run 44764587232](https://github.com/DarkZeus/yaffw/actions/runs/44764587232) | `5e2dd0082aa919a15a03717e2a94250425da25fb` | 170 | 181 |
| [run 44752170299](https://github.com/DarkZeus/yaffw/actions/runs/44752170299) | `707ef556e45d89e7f1ebf5d99cae1c3a0e8d64b4` | 241 | 257 |
| [run 44597712994](https://github.com/DarkZeus/yaffw/actions/runs/44597712994) | `91c4b37b323f0e2e3cf923dc18df9291e2c731cd` | 50 | 1735 |
| [run 43624350891](https://github.com/DarkZeus/yaffw/actions/runs/43624350891) | `16fe312b5f893e04989dae0d75ecf401c967c115` | 47 | 57 |
| [run 43622470122](https://github.com/DarkZeus/yaffw/actions/runs/43622470122) | `2353b228c450e54b61cf2e36bb5044ed177a5e1c` | 41 | 51 |
| [run 43620260538](https://github.com/DarkZeus/yaffw/actions/runs/43620260538) | `0df352932b3e2ae67d2dbec270458448690df06c` | 46 | 58 |
| [run 42418179456](https://github.com/DarkZeus/yaffw/actions/runs/42418179456) | `8bdeef5f4f75aa3b75e26759c0be807163f35a01` | 44 | 49 |
| [run 42418035348](https://github.com/DarkZeus/yaffw/actions/runs/42418035348) | `b58ef8dd724c2b78f9cf7bfff272c5bba5dbade5` | 49 | 64 |

The two Nov 20 runs implement today's complete contract; earlier revisions lack Astro/browser gates. Never compare their faster green times as equivalent verification. No branch check is actually required by GitHub today; “required result” below means completion of the full Verify contract, not an enforced protection rule.

Percentiles use linear interpolation between ordered observations. For all eight heterogeneous historical runs, created→report p50/p95 = 48.00/216.15s; commit→report = 61.00/1217.70s. The latter includes a 28-minute commit-to-push delay on Nov 19. For the **two comparable full-contract runs**, created→report = **205.50/237.45s**, commit→report = **219.00/253.20s**. Commit time is GitHub's `head_commit.timestamp`; it is client-supplied metadata, not an independently recorded push-ingestion time. Queue uses run creation→job start; final reporting uses job completion→run updated_at. API timestamps have one-second granularity and updated_at is an observable proxy for final reporting, not a separately instrumented webhook receipt.

| Full-contract phase | n | p50 (s) | p95 (s) |
| --- | ---: | ---: | ---: |
| Queue | 2 | 3.00 | 3.00 |
| Checkout | 2 | 2.00 | 2.00 |
| pnpm setup | 2 | 2.50 | 3.85 |
| Node setup + pnpm store restore | 2 | 9.00 | 12.60 |
| Frozen dependency install | 2 | 6.00 | 9.60 |
| Chromium + system dependencies | 2 | 42.00 | 54.60 |
| Entire serial pnpm verify step | 2 | 131.00 | 139.10 |
| Root formatting | 2 | 1.24 | 1.31 |
| Type-aware root lint | 2 | 2.31 | 2.45 |
| Vitest | 2 | 21.49 | 22.75 |
| Editor Vite build | 2 | 2.18 | 2.27 |
| Editor TypeScript 7 | 2 | 1.90 | 2.21 |
| Landing formatting | 2 | 0.68 | 0.72 |
| Landing lint/accessibility | 2 | 1.55 | 1.65 |
| Astro check / TypeScript 6 | 2 | 5.22 | 5.56 |
| Landing build | 2 | 39.42 | 42.18 |
| Landing browser smoke | 2 | 53.76 | 57.01 |
| Final reporting after job | 2 | 1.00 | 1.00 |

Action step times come from the jobs API. Internal serial phases use **timestamped script-start intervals**, including pnpm/process handoff, not CPU timings. Browser smoke ends at post-job cleanup. Missing boundaries remain absent/unknown, especially separate system-library versus browser download times and historical typecheck boundaries. Node setup and store restore cannot be separated from step timestamps alone. The latest logs further locate image transformation at ~34s and show all five browser scripts running serially; smoke is the largest measured execution bucket and is changed first.

Runner: `ubuntu-latest` resolved to ubuntu-26.04, x64; latest image `20261116.202.1`, Node 24.22.3, pnpm 10.33.0. Logs show four Oxc threads; GitHub documents 4 vCPU/16 GB RAM for standard public Linux runners. Historical actual CPU/RAM measurements are unavailable. Current local measurements use Apple M1 Pro (10 logical CPUs), Node 24.21.0; they are not hosted-runner estimates. A first exploratory baseline accidentally used the host's unsupported Node 25 through Volta; it is excluded from comparisons. Subsequent measurements use an explicit Node 24/pnpm PATH.

Four of eight runs restored the exact pnpm store cache (50%); two full-contract runs have one hit (50%). PR hit rate and >95% eligible-PR target are unmeasured (no PR runs). Cache inventory: three master store entries, 480,126,539 bytes total. No browser/image cache existed. Cache restoration and saving are included in wall time. GitHub timing API reports **0 billable milliseconds**, 8 jobs; actual job wall time sums to **659s (10.98 minutes)**, versus 688s run-created→report time. An illustrative per-job minute rounding yields 17 runner-minutes, not an invoice. This public repository uses standard hosted runners, which [GitHub prices at $0](https://docs.github.com/en/actions/concepts/billing-and-usage). Monthly Actions compute cost before = $0 under that assumption; Cloudflare/paid-runner costs are not inferred from this endpoint.

## Correctness and deployment boundary

`GET branches/master/protection` returns **404 Branch not protected**; `GET rulesets` returns **[]**. There are **no enforced required checks**, no bypass restriction and no pre-integration barrier. Local verification/hook success and post-push Verify do not change that fact. [GitHub required checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) can reject a direct push unless the incoming SHA already has trusted checks, but Actions triggered only after that push cannot supply a pre-push check. Keeping local development on master is possible with a separately submitted candidate SHA and trusted pre-promotion CI; a candidate ref/tag or external verifier and restricted promotion credentials would be an explicit policy/infrastructure addition. A PR/merge queue would also require an explicit policy change. No such change is silently introduced here.

Both Workers have independent Git build connections. The landing documentation configures `pnpm check && pnpm build:production` in `landing`, then `npx wrangler deploy`; this omits editor gates and browser smoke. The editor's actual external build command is not visible in repository configuration. Both wrangler files deploy existing dist directories; neither enforces full verification. Current SHA's Cloudflare editor check completed **15:35:18Z**, while GitHub Verify completed **15:37:02Z**: the independent editor build reported success 104s earlier. The landing check completed 15:37:07Z, but incidental ordering is not a gate. GitHub deployments API returns no records; active Worker revision and exact external settings require Cloudflare account access. Production is **not proven protected**.

## Suite completeness and test policy

At baseline, `pnpm exec vitest list --filesOnly` discovers **52 files / 347 passing tests**: 42 product/UI files, one NLE prototype file, seven verification files and two landing files. All five `.test.mjs` files are discovered by Vitest: landing site-origin and timeline; EBML; copy-boundary artifact; preview A/V fixture validation;. Discovery is measured, not inferred from extensions.

The complete inventory is in [baseline-test-files.txt](baseline-test-files.txt). Node-named `.test.mjs` files use Vitest imports and are part of `pnpm test`; standalone browser `*-check.mjs`, editor media/fixture diagnostics, prototype browser scripts and separate verifier tsconfigs are explicit diagnostics and are not all in `pnpm verify`. Root TS7 includes product, NLE and verification TS/TSX; landing uses Astro's TS6 independently. Root checks retain every current exclusion and rule, including React Compiler eligibility exclusions. Astro owns `.astro` formatting, lint/a11y and type checking.

ADR-0009 is current: retain core/session invariants. ADR-0004/0008 are current and unaffected: preserve framework-independent model direction. ADR-0026 is current: preserve prototype/verification commands and no backend. The historical test-reduction report is retained as historical evidence. No test is deleted, assertion loosened, retry added, timeout widened or worker isolation disabled. No changed-test selection or sharding is justified by a full suite already below 30s; every input (including aliases, generated routes, dynamic imports, workers, fixtures, CSS/tokens, Astro content, unknown relationships and the Mediabunny patch) continues to run full verification. Selection false-negative experiments are inapplicable because there is no selection implementation or selected green required status.

The requested two-week caught-regression/change-detector observation period starts with this audit; no two-week outcome is claimed. Record actual fixed failures with revision, reproducer, classification and invariant. No product test failures have yet been fixed during that observation period.

## Change 1: bounded browser concurrency

The first change keeps all five smoke scripts and their assertions intact, but schedules two browser processes instead of one. Each still owns fresh browser contexts; each verification invocation gets a fresh output directory and OS-assigned preview port. Duplicate check names are rejected. Failed scripts are collected while other scripts finish, then the runner exits nonzero and stops the preview in `finally`.

Local same-build baseline (Node 24.21.0, n=1) serial smoke: **44.24s**. First complete optimized `pnpm verify`: **50.31s**, 52/347 passing; measured smoke children: navigation 19.822s, mobile 16.517s, tabs 2.776s, progressive 4.514s, metadata 1.246s. Browser scheduling puts the smoke critical path at ~23.81s plus preview/process setup, versus the serial children's sum. This is local evidence; it does not establish hosted-runner p50/p95.

The first draft's path `resolve` import was shadowed by a Promise resolver. Lint exposed the unused import and the draft's failed-browser probe exposed early resolution. It was fixed before committing; failure propagation is explicitly checked against corrupted built HTML rather than accepting an exit-zero timing measurement.

Failure probe: changed built changelog Features destinations to a nonexistent fragment; navigation failed, independent metadata completed, aggregate command exited 1, and its preview port rejected a subsequent connection. Original build bytes were restored. No source assertion was changed.


## Change 2: measured lanes, caches and honest aggregation

A single hosted job retains one checkout/install/browser setup. Six independent logical lanes have a maximum of three active lanes: root format/lint; editor TS7; editor Vite build; full Vitest; landing format/lint/Astro TS6; production-origin-validated landing build then all Chromium smoke scripts. Editor Vite and typecheck are separate in this graph because `pnpm build` already includes typecheck; each application builds exactly once. Root/landing check groups execute every member even if another fails. Smoke is blocked (and final verification fails) after a failed build. Discovery must exactly match actual Vitest result paths, once each, with no pending/todo/failed tests. All child logs and JSON timings survive a failure. Required-status aggregation is the existing `verify` job, whose complete `pnpm verify` must exit successfully; there is no path-filtered/skipped lane represented as success.

Worker experiment on the same product revision: standalone four isolated workers with shuffle seed 20261120 took 12.78s locally; two workers under six-lane contention took 37.08s. Four workers plus postponing memory-heavy Astro checking until tests finish brought the tests command to 23.94s and full verification to **37.66s** (n=1), versus change 1's 50.31s. [Complete local measurements](parallel-local.json) include every command and budget. This is not evidence for hosted p95. New runner regression tests bring discovery to **53 files / 349 tests**, all passing; original 52/347 remain intact. CI records CPU, RAM, ABI, cache results, seed and actual per-file JSON durations. Every CI run shuffles all files/tests with its recorded run-ID seed. Worker isolation, jsdom, RTL cleanup, mocking semantics and the original coverage denominator remain unchanged.

The contention experiment also reproduced an existing history/scroll race: the test accepted the destination pixel while native smooth scrolling was still moving, then asked history to snapshot that intermediate position. Back restored Features at y=42.14 behind the 64px header. The assertion now requires consecutive identical correct positions before issuing history commands, retaining the same 100×50ms deadline and all URL/focus/header/padding assertions. This strengthens readiness rather than widening a timeout or retrying a failed test. The original failure is retained in the audit's raw local log. Classification: test change detector/readiness flaw exposed by CPU contention, not an observed product regression; observation period remains less than one day.

Evaluated `no-shadow` repository-wide: it reports existing shadowing throughout product/prototype/diagnostic code. Rather than rename unrelated domain variables as a latency change, enable it for verification orchestration scripts, where it directly detects the Promise/path mistake from change 1. No findings remain in that scope. All previous rules/exclusions remain in force.

Acceptance budgets are explicit command wall-clock limits: root format 2s (goal <1), root lint 4s (goal <1), editor types/build 5s each, tests 30s, landing format/lint/types 3/5/10s, landing production build 50s, browser smoke 35s, total local execution 120s. In CI an overrun makes Verify fail **after** commands/evidence finish, separately from correctness. These measured starting budgets do not claim the 35s longest-lane or 15s setup aspirations are met. Cold image transforms are allowed to run completely; no test timeout changes. Local full verification enforces correctness and reports budgets; CI also enforces those budgets.

Caches preserve the frozen install, workspace overrides, release-age/trust/build-permission policy and Mediabunny patch. Keys include platform, architecture, runner image version, Node patch/ABI, pnpm version, manifests, lockfile, workspace settings, optional npmrc and the patch. The optional installed-dependency experiment restores root and landing node_modules including pnpm links, then still runs frozen install and a native canvas allocation. No approximate installed-dependency restore is allowed. Default remains the content-addressed pnpm store until comparable hosted evidence supports changing it. Chromium keys bind the exact pinned Playwright and frozen package integrity (which contains its browser revisions), platform and runner image; missing browsers still install. `--only-shell` omits the unused headed binary; all smoke scripts launch the same default headless shell as before. System libraries/fonts still install on hosted images. Astro caches only image-transform assets, never final dist or a passing-check result. Cache misses rerun the same checks/builds. Only completely successful master runs save caches; PRs restore but do not seed.

Manual Verify dispatch offers store/modules/cold cache modes, cache salts, shallow/blobless checkout and the exact matching official Playwright image for controlled hosted benchmarks. All modes run the full contract. Blobless still checks out the working tree (and fetches blobs later as necessary); depth 1 is adequate because selection is absent. No selection claims require unavailable merge history. The existing branch/PR cancellation is retained; master uses a unique run group so neither running **nor pending** integration verification is superseded. No paid runner is enabled.
