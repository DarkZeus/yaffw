# Current app test audit

Audited 2026-11-21 against `859624f` and the changes in this audit. This is a
behavior and verification-path audit, not a claim that every possible input or
browser is covered. No production behavior was changed.

## Method

Traced `/` through `EditorNextRoute`, its production composition and session hook,
the Preview/Selection adapters, and the default export runner. Compared the test
inventory and representative assertions with `CONTEXT.md` and ADRs 0006, 0009,
0011–0015, 0017–0018, 0021, 0023–0024. Reviewed CI discovery and separate browser
entry points, ran production coverage, exercised real media, and temporarily
introduced plausible faults in an isolated source copy outside the repository.
The user's running development server was not used for browser checks.

## Findings and repairs

| Finding | Repair |
| --- | --- |
| Green CI covered unit tests and five landing checks, but no real editor workflow. | `pnpm test:editor` serves the production `dist` on an OS-assigned loopback port and runs six editor check groups. Root `pnpm verify` includes it. |
| Actual exports need platform AAC support; Linux-only CI cannot establish default-profile export correctness. | Keep the portable gates on Linux and add a macOS editor job. Missing AAC fails clearly; no encoder polyfill, profile substitution, conditional skip, or allowed failure. |
| Real two-track exports were checked for audible events, which could pass with one track silently dropped. | Compare decoded output RMS with an independent FFmpeg sum of both source tracks at five events, allowing 15% encoder variation. Assert the native Preview follower is muted. |
| No default browser check established recovery from unreadable media or complete main-thread object URL release on Close file. | Add a session check for malformed input, retry, video-only playback/frame stepping, Close file, and reopening the same file. Observe real URL creation/revocation without replacing their behavior. |
| Short playback checks could silently fall back without establishing the MSE path. | Require the first session to play through a real MediaSource URL, then disable MSE support and require direct-file playback in the second session. |
| The waveform mock lacked the real `setOptions` method, and no unit assertion exercised appearance observers. | Bring the mock up to date and test in-place recoloring, preserved Selection region, fallback-canvas repaint, and observer cleanup. |
| The appearance browser check could accept a missing canvas as a changed image. | Require a present canvas image that differs from the prior image. |
| Keyboard suppression was used by the app without focused coverage of form/modal ownership and listener lifetime. | Add three hook tests for editable targets, dialogs, export locking, handled events, current callbacks, and unmount. |
| Six maintained landing checks were separate diagnostics. | Include clipboard, links, demo gestures/playback, disclosure, responsive images, and contrast in the normal landing smoke command. |
| Harness tests could be read as actual export proof, and one reproduction command referenced a deleted test file. | Clarify injected-runner test names and update the cleanup-test command. Keep the useful orchestration assertions. |

## Current evidence by behavior

| Current requirement | Deterministic tests | Real production browser evidence in the default gate |
| --- | --- | --- |
| Import and readiness; reject stale analysis | Core session, asset analyzer, session hook and file-drop tests | Actual route, unsupported runtime gates, unreadable container, retry, MP4/MKV imports |
| Preview transport and separate clock ownership | Native transport/player, bounded audio engine, interruption and output-time tests | Real playback/seek/frame step; muted multitrack follower; MSE and direct-file paths |
| Selection in integer microseconds, valid minimum range, gesture lifecycle | Session, selection gesture, waveform surface and render-performance tests | Keyboard boundaries carried into downloaded CFR/VFR selected-range media |
| Export settings, cancellation, stale progress, retry and editing locks | Output-settings, runner, route recovery and session hook tests | Real default profile, No audio, silent mix, CFR/VFR custom bitrate and frame timestamps |
| Included audio tracks contribute; preview solo stays separate | Mix plan, browser audio mix and session tests | Two-track output compared with independently decoded source mix; mixed/silent/no-audio artifacts |
| Generated media requires explicit delivery and becomes invalid after decisions change | Session hook and route cleanup/recovery tests | Explicit download, Selection invalidation, Close file and re-import/playback |
| Resource ownership and cleanup | Worker jobs, synchronous/async scopes, decoder/resource hooks, route cleanup and renderer tests | Main-thread object URLs released after failure/Close file; player removed; same-file reopen |
| Light/Dark/System preserve the loaded player | Renderer observer and canvas-fallback lifecycle tests | Actual theme persistence/OS changes, canvas repaint, mounted player, portaled controls, narrow layout and contrast |
| Landing interactions reflect the built site | Timeline/configuration tests | All eleven landing browser checks, including no-JS and failed/delayed initialization |

These tests import current production modules. Older tests were retained where
their behavioral invariant still applies; age alone is not a reason to replace
them. Mocks remain appropriate for deterministic races and failure injection,
but actual codec and browser behavior is now checked separately.

## Fault detection

Each mutation ran alone, after a passing baseline, and was restored afterward.
Failures were assertion failures, not syntax/import/build failures.

| Deliberate fault | Assertion that detected it |
| --- | --- |
| Reduce the minimum Selection duration to one microsecond | Existing core session test |
| Accept an obsolete successful import request | Existing session hook test |
| Omit cancellation of an unsettled export resource | Existing default runner test |
| Observe a detached element instead of theme changes | New waveform repaint tests |
| Leave theme observers connected after unmount | New waveform cleanup tests |
| Allow Preview shortcuts to consume editable-field input | New keyboard ownership test |
| Export only the first included audio track | Strengthened actual MP4 export check: RMS 0.01243 versus independent two-track RMS 0.02488 |

The final fault still produced audible, synchronized media, so the previous
audibility/alignment checks would not establish that both tracks were present.
The new assertion failed, the editor smoke command exited nonzero, and its
assigned preview port was confirmed closed afterward. No mutated production
source or artifact was placed in the repository's `src` or `dist`.

## Running and interpreting the gates

```sh
pnpm exec playwright install chromium
pnpm verify                    # all gates; requires ffmpeg/ffprobe and native AAC
pnpm verify:checks             # portable checks, builds, and landing browser checks
pnpm build
pnpm test:editor               # all six groups against the existing production build
pnpm test:editor session appearance
pnpm --filter yaffw-landing test:smoke demo disclosure
pnpm test:coverage
```

FFmpeg independently generates or decodes verification media; it is not used by
the product export path. Chromium's native AAC encoder uses platform facilities;
see [Chromium's explanation](https://issues.chromium.org/issues/40223844) and
[Mediabunny's codec availability contract](https://mediabunny.dev/guide/supported-formats-and-codecs).
CI's Linux `verify` job runs `verify:checks`; macOS `editor` builds the editor and
runs `test:editor`. Both must pass. Neither runner reuses the user's development
server. Browser children have a three-minute per-group limit, and preview servers
close on normal success or failure. Setup failure and unsupported codecs fail
verification instead of reducing its scope.

## Limits and snapshots

Final local `pnpm verify` passed: 385 tests across 55 files, editor and landing
format/lint/type/build gates, all eleven landing browser checks (including 486
rendered contrast samples with no failures), and all six editor browser groups.
All seven injected faults were detected by assertions. The browser used was
Playwright Chromium 158.0.8127.18 on macOS; Node was 24.21.0.

The pre-change baseline passed 380 tests in 54 files. Production-source coverage
was 74.52% of lines and 70.44% of branches. Those percentages include
verification/prototype helpers under `src`; they do not show browser execution
and are not a product correctness score. No coverage thresholds or exclusions
were changed. The historical figures in `test-suite-reduction.md` remain an
explicitly dated snapshot rather than current totals.

The audit adds five focused unit cases and six runtime scenarios in the session
browser check. Browser coverage uses short synthetic fixtures in the pinned
Playwright Chromium. It does not establish physical audio/display sync,
universal frame-exact export, every codec/container permutation, every malformed
input, long-file memory limits, every MSE quota/rebuffer condition, OS-level audio
interruption, or Firefox/Safari behavior. The long-trailer, sparse-index,
device-output and historical comparison harnesses remain explicit investigations;
they require distinct fixtures or measurement conditions. Deterministic
cancellation/late-result tests remain the reliable way to exercise those races.

Local validation and the configured GitHub jobs are separate evidence: hosted CI
must still run after these changes are pushed. This audit does not change branch
protection or claim that GitHub checks block Cloudflare's separate deployment.
