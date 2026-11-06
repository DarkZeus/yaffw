# Focused test suite

Updated 2026-11-06. This report records the test-reduction snapshot before the structural refactors. Those passes subsequently added 19 focused regression cases, bringing the passing suite to 229 tests across 44 files; the coverage figures below still describe the 210-test snapshot. See [the refactor decision log](../agents/codebase-untangling.md).

The current testing priority is to retain tests for difficult algorithms, state transitions, concurrency, timing, and resource ownership. The user explicitly chose this priority over the previous 2% coverage-loss limit.

## Reduction result

| Stage | Tests | Test files |
| --- | ---: | ---: |
| Original suite | 679 | 77 |
| First coverage-preserving reduction | 339 | 68 |
| Current complexity-focused suite | 210 | 41 |

This pass removed 129 more tests (38.05%) and 27 more test files. The total reduction from the original suite is 69.07%. All 210 remaining tests pass, with no skipped or todo tests.

## Retention policy

Keep tests when they establish a meaningful invariant in difficult code:

- Bounded audio scheduling and PCM decoding, packet gaps, channel transforms, monotonic presentation time, and selection-boundary clipping.
- Cancellation, stale async results, recovery, disposal ordering, and resource ownership across replacement or unmount.
- Export snapshots, failure/cancellation recovery, actual artifact boundaries, and codec/container fallback resolution.
- Core session transitions, microsecond/frame selection bounds, and linked A/V insert, overwrite, split, resize, and ripple edits.
- High-frequency playback updates without unwanted React rerenders, scrub handoff/decoder reuse, and waveform worker/renderer lifecycle races.
- Signal detection and qualified measurement of real audio/video evidence, including uncertainty and false-precision rejection.

Rendering labels, static UI states, route aliases, preset CRUD, direct prop/argument forwarding, simple numeric mappings, and prototype rename/picker controls do not independently justify tests in this suite. Remove redundant cases and their fixtures instead of retaining them solely for a coverage percentage. Input validation remains worth testing when it establishes correctness of a difficult algorithm.

The scrub race tests now wait against an elapsed-time deadline rather than an iteration budget. This avoids startup polling failures during coverage-instrumented dynamic imports while preserving the existing debounce timing assertion and cancellation/disposal assertions.

## Production coverage

Both measurements use Vitest 3.2.7 and `@vitest/coverage-istanbul` 3.2.7 with all `src/**/*.{ts,tsx}` production sources, including untested files. Vitest's default test/setup exclusions remain unchanged. Prototype and verification code is outside the production denominator, though its retained tests still run.

| Metric | Before this pass: covered / eligible | Focused suite: covered / eligible |
| --- | --- | --- |
| Lines | 5,293 / 6,845 (77.32%) | 4,657 / 6,840 (68.08%) |
| Statements | 5,409 / 7,053 (76.69%) | 4,753 / 7,048 (67.43%) |
| Functions | 1,296 / 1,579 (82.07%) | 1,092 / 1,575 (69.33%) |
| Branches | 3,362 / 4,567 (73.61%) | 2,785 / 4,542 (61.31%) |

Removing route-import tests also changes the instrumented totals in three unchanged route modules: five fewer eligible lines/statements, four fewer functions, and 25 fewer branches. The table shows the actual denominators. All other production modules retain identical eligible totals; no production files were removed from coverage.

The earlier global 98%-of-baseline thresholds were removed because the user explicitly replaced that constraint with complexity-focused test selection. `pnpm test:coverage` still reports full production coverage. Coverage describes executed code and does not prove equivalent fault detection after test removal.

## Verification

- `pnpm test:coverage`: 210 passed across 41 files.
- Scrub race tests with coverage: all six passed after the polling fix.
- `pnpm build`: passed, including TypeScript checking.
- Final `pnpm typecheck`: passed.
- Changed source test files: formatted and linted with Biome; the updated scrub test also passes `biome check`.
- `git diff --check`: passed.
- Repository-wide `pnpm lint`: still reports the same ten pre-existing `useImportType` errors in `src/components/ui/`, plus existing `.tanstack/tmp/router-generator-*` permission diagnostics. This pass does not modify those UI files or temporary-file permissions.

Production implementation code is unchanged. Tests were deleted or trimmed, not skipped, excluded, or repackaged inside new loops.

Run `pnpm test` for the suite or `pnpm test:coverage` to regenerate JSON, summary, text, and HTML reports under `coverage/`.
