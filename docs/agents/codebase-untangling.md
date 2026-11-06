# Codebase untangling — 2026-11-06

## Scope and baseline

Preserve the existing working-tree test reduction (saved separately in `/tmp/yaffw-untangle-baseline.patch`). User selected both optional Comments and Tests cleanup. Baseline: 210 tests across 41 files pass; editor TypeScript passes; Biome check fails with stale/generated traversal, formatting and type-only-import diagnostics. Initial dependency scan found only engine/graph/controller type-contract cycles; no unreferenced production modules after accounting for browser entry points and worker URLs.

Groups 1–10 record the initial audit before implementation. The repeat audit added group 11 and the documented surplus/validation refinements. Findings are grouped under root fixes, rather than a separate fix per symptom.

## Decisions and findings

1. Give synchronous cleanup one generic owner in media-work, with asset identity kept in its asset-specific controller.
   - `preview/lifecycle/preview-adapter-lifecycle.ts` and `media-work/scopes/active-media-asset-cleanup-scope.ts` independently implement registration removal, idempotence, reverse disposal and error aggregation.
   - Audio and Selection import a preview-named lifetime for general browser-resource cleanup.
   - Keep async media-work disposal separate: awaiting cancellation and rejecting late ownership are different contracts.
2. Give one-shot worker jobs one lifetime owner and share each feature's protocol between caller and worker.
   - Waveform and video-strip clients repeat listener/abort/termination handling and their workers redeclare message shapes.
   - Video-strip postMessage failure bypasses cleanup; post-listener abort recheck differs from Waveform.
   - Preserve distinction between worker infrastructure failure (runtime fallback allowed) and domain unavailable result (final).
3. Separate shared channel analysis from offline rendering, and give preview contracts and buffering policy explicit owners.
   - `preview-audio-graph.ts` imports channel analysis through the offline export mixer, pulling export decoding/Mediabunny concerns into live preview.
   - Engine and controller independently spell the accepted two-second horizon.
   - Engine implementation owns types imported back by graph/controller, creating type-only cycles.
4. Remove verified unused audio/thumbnail helpers and aliases.
   - Two engine resource-gain exports have no callers; rate setter only null-forwards; resource state alias adds no distinct contract; timestamp thumbnail helper only re-exports unused behavior.
   - An unused functional-scenario wrapper duplicates the actual browser scenario entry point; remove it and its uncalled input type. Keep real comparison executors and historical baselines.
5. Own Output settings value operations in core, and use one output-container factory registry.
   - Modal, preset store and Generated media metadata independently deep-copy the same settings shape.
   - Preset validation repeats quality/settings structure.
   - Support registry and format-creation switch separately list the same supported containers.
   - Browser runner always resolves an output plan, while its internal optional typing admits impossible fallback paths.
   - Core capability and Export inspector duplicate the same codec display formatter (the modal intentionally uses different labels).
6. Let accepted editor session state determine Generated media artifact validity.
   - Each editing command invalidates the artifact separately from reducer invalidation, duplicating which decisions affect output.
   - Artifact invalidation can happen for a rejected/no-op command; newly added commands can forget it.
   - Remove unused artifact read interface and unused audioMixHasIncludedTracks; remove unreachable ClosedSession/runtime.checked branches and stale closed-state copy where verified.
   - ReadyMediaAsset caches exportCapability at analysis time even though runtime export planning uses current editing decisions; its only remaining consumer reads the constant default profile. Remove that stale authority and keep export capability at the session/planning owner.
7. Define prototype clip slicing and sequence format once inside the prototype.
   - Split/insert/overwrite each recalculate source offsets, duration, fades and identity/linkage.
   - Nominal frame rate/dimensions/duration are repeated between model, shell metadata, viewer and inspector.
   - Prototype model embeds sample sequence data while asset IDs/preferred insertion tracks and sequence names are repeated across sample setup, hook, shell metadata and inspector. Colocate sample configuration without coupling product to prototype.
   - Preserve intentionally independent prototype and product models.
8. Make verifier fixture prerequisites explicit callable setup.
   - Copy-boundaries/scrub-index app checks rely on a different command generating files first.
   - Waveform-gap relies on upgrade verification fixtures; silent-range app checks rely on inline setup in low-level check.
   - File-backed export relies on a side-effect-only fixture script.
   - Share setup only; retain independent measurement and assertions.
9. Make repository validation describe the actual maintained sources and configs.
   - Biome refers to vite.config.js rather than vite.config.ts and traverses generated .tanstack temporary directories.
   - Product TypeScript include list omits the browser entry and Vite config.
   - Fix existing formatting/type-only-import errors without disabling or weakening checks.
   - Remove exact duplicated `.gitignore` rules, preserving final rule and negation order; confirm ignore results stay equivalent for tracked and representative generated paths.
10. Remove comments that restate implementation, then review remaining tests last.
    - Main bootstrap contains starter narration; some helpers narrate obvious state operations.
    - Preserve external/browser/library constraints, timing evidence, domain invariants and historical comparison intent.
    - Existing suite was already reduced to complex behavior tests. Retain tests that catch regressions; add focused behavior coverage only for new ownership/concurrency seams.

11. Give editor identity generation one owner.
    - Draft import, asset analysis, export commands and Generated media metadata copy the same UUID/fallback policy with only the identity prefix changing.
    - Consolidate the policy in `editor-core/identity.ts`, retaining injected IDs for deterministic callers.

## Required special cases retained

Browser AudioContext interruption/resume and gesture restrictions; native video authority for video-only media; audio-master authority during buffering; generation/version checks after cancellation; exact resource cleanup and stale-result rejection; measured buffering/chunk limits; worker infrastructure fallback; packet-gap/unknown-duration/PCM timestamp distinctions; known-silence vs decode failure; explicit no-audio vs exclude-all vs zero-volume inclusion; full-selection export vs bounded preview channel classification; source codec/container replacement; estimated frame timing fallback; selected export best-effort evidence; buffered artifact delivery; denied browser storage; disabled deferred AI/subtitle controls; independent benchmark baselines and intentionally imposed stalls. These arise from current requirements or external systems.

## ADR reconciliation

No ADR changes are required. Current: 0002/0004/0005/0006/0008/0009/0011 (single-asset core, reducer, thin adapters and concern ownership); 0012/0013/0014/0015/0017/0018 (preview/selection/runtime contracts); 0016/0019/0021/0022/0023/0024 (capabilities, workbench, audio and documented outputs); 0025/0026 (retained product/prototype scope). Historical 0001/0003/0007/0010/0020 are read in light of their explicit later supersessions. All refactors preserve the active decisions; no new domain terms, public behavior, persistence formats, output profiles or architectural direction are introduced.

## Verification and repeat audit

All eleven fix groups are implemented. Optional comment cleanup removed implementation narration while retaining browser/library constraints and domain evidence. The existing complexity-focused test suite remains; the waveform worker test now checks behavior without depending on removed request IDs or event-listener implementation details. Sixteen focused regression cases cover worker ownership, cleanup order, immediate artifact validity, output sizing/audio omission and prototype slicing, bringing the suite to 226 tests across 43 files.

A repeat audit found and fixed two additional issues: repeated editor ID generation and fixture setup performed after browser launch but outside cleanup protection. A final exported-function scan removed the unused prototype scenario wrapper. Three cross-reviews then reported no remaining concrete worthwhile issue in the audited areas. Source dependency scans went from two engine contract cycles to zero, including type-only imports.

Verification:

- `pnpm test`: 226 tests across 43 files passed; no skipped or todo tests.
- `pnpm build`: passed, including the expanded product TypeScript boundary. Vite retains its existing large-chunk advisory; no gate was weakened.
- `pnpm check` and `pnpm lint`: passed over 261 maintained files, including sources the old configuration missed.
- All six verification TypeScript projects passed: copy-boundaries, file-backed-export, mediabunny-upgrade, scrub-index, silent-audio-ranges and waveform-gap.
- Standalone NLE prototype: 17 behavior tests, TypeScript and production build passed.
- `node verification/waveform-gap/app-check.mjs` against a temporary Vite server in Brave: prepared fixtures directly, imported real media, rendered an 8,192-bucket waveform, ran both production workers, played/paused, exported/downloaded and checked generated tone/silence using FFmpeg. Evidence is local at `tmp/waveform-gap/app-evidence.json`; the screenshot was visually inspected for waveform/ruler alignment.
- A second real browser run (`silent-audio-ranges/app-check.mjs`) passed mixed and all-silent exports, independent PCM/video controls, artifact invalidation, Close file and re-import. The temporary Vite server was stopped after browser verification.
- `.gitignore` behavior matched for 1,195 tracked/representative generated paths after exact-rule deduplication.
- `git diff --check`: passed.

The original uncommitted test-reduction work remains preserved. No architectural decisions or product requirements were changed. Necessary media/browser special cases listed above remain explicit; no new fallback, compatibility layer, generic mediator, or dependency was introduced.

## Focused duplicate/stale implementation pass

The user requested a second, explicitly duplication-focused pass. Its baseline includes all earlier uncommitted work, snapshotted in `/tmp/yaffw-dedup-baseline-files.json` and `/tmp/yaffw-dedup-baseline.patch`. Comment/test cleanup remains authorized. These findings were recorded before source edits:

1. Keep one current export planning contract.
   - Optional settings/mix/support and optional resolved plans preserve an older planning path alongside the active route/harness/modal path.
   - The runner consults raw settings after receiving a resolved plan. Resolve conversion intent once, preserving the distinction between source dimensions and explicitly requested downscaling.
   - Session export snapshots and static profile fields are stored but never read; actual runner inputs already capture the job's editing decisions.
   - Modal draft validity repeats aggregate core validation; container lookup is repeated in codec paths and the modal.
2. Remove unreachable preview and modal UI implementation.
   - The local-video-only provider surface retains an unreachable HLS provider branch and audio-only view branch.
   - Chapter selection stores an unread selected flag. Output settings sections receive discarded icon/description props; modal draft aliases and forwarding wrappers add no behavior.
   - Timeline repeats the core minimum-selection-duration policy.
3. Keep only consumed audio resource/state contracts.
   - Window states carry duplicate `kind`/`state` discriminants. Resource descriptors copy unread track/index/sample-rate/failure data already owned by the provider/controller.
   - Track descriptors store unused first timestamps; PCM slices store unread ends; retained scheduler chunks carry unread IDs; channel analysis stores unread requested-mode/reason fields.
   - Scheduler source stopping/disconnection is implemented twice; graph channel-mode resolution accepts an unused buffer argument.
   - Export audio rendering keeps an unused track index and empty-result branches made unreachable by the decoder's positive-length-or-error contract. Provider disposal repeats its existing cancellation aggregation.
   - A final result-contract trace found that mixed audio returned an unread included-track count and a single-use buffer wrapper; window pulls returned unread generation/range fields around track states, while chunks redundantly carried the enclosing track identity. Return the AudioBuffer or track-state array directly and keep identity on track states.
   - The monitoring lifecycle's returned object, fallback engine ref and ready callback had no product callers. Require its supplied engine ref and retain its actual status callback/internal mix state. The ownership test now asserts late engine destruction directly, with no unused rendered probe state.
   - The generation's public start-time getter is only forwarded by wrappers and never consumed; remove it while retaining the internal generation start option.
4. Own repeated audio policies and evidence primitives once.
   - Core session and Audio panel normalize the same whole-number volume percentage independently. Gain conversion intentionally preserves fractional values and stays distinct.
   - Graph and panel independently label channels. Evidence modules independently initialize the same decoder metrics and implement identical cancellation checks.
   - Keep the historical controller and baseline decoding independent: their recorded isolation is part of the comparison contract.
   - Implemented: one track-state discriminator, minimal resource/channel metadata, shared channel labels/count policy, shared decision-volume normalization, shared evidence metric initialization/cancellation, and one scheduled-source stop policy. Provider metadata/missing-track failure coverage now asserts actual generation publications rather than an unread copied failure list.
   - Engine and graph independently normalize Preview volume. Keep normalization at the graph's gain boundary and remove the redundant engine helper and its forwarding wrapper.
5. Share verification operations that perform the same job.
   - Browser launch/dependency/environment setup repeats across more than twenty runners.
   - Interruption/output-timing scripts duplicate the bounded production-audio trial protocol; A/V baseline/comparison scripts duplicate fixture/hash/bundling setup.
   - The controlled historical evidence harness also implements the same bounded trial. Share its trial runner across all three callers while retaining the controlled fixture hash gate, historical report schema, and explicit candidate presentation polling.
   - Upgrade/scrub fixture generation duplicates the EBML parser.
   - Keep independent trial observations, assertions, recipes, candidate activation and historical evidence in their owners.
   - The scrub verifier compares entire source text against an old implementation, then measures a candidate reconstructed from that old source. Measure the actual instrumented current provider instead, retain the immutable historical indexed reference, and record the current provider hash. Preserve the real frame, cancellation and disposal assertions.
6. Give the prototype one fade-envelope rule.
   - Picture opacity and audio volume independently compute the same clip fade envelope. Remove incidental local-only exports and forwarding wrappers when their lack of consumers is verified.
   - Product and prototype Vite servers implicitly share `node_modules/.vite`; running the prototype invalidates the product's lazy optimized modules (observed 504 Outdated Optimize Dep errors during the waveform smoke). Give the prototype its own ignored `node_modules/.vite-nle` cache; resolved configurations now have distinct cache directories.
7. Share exact browser/diagnostic primitives instead of maintaining variants.
   - Preview, Selection and metering repeat animation-frame cancellation, fallback scheduling and clock reads; scrub rendering/cache repeat the canvas portability factory.
   - Many modules implement identical Error-to-message conversion, including variants named technical-details conversion. Keep caller-specific error text and cancellation semantics distinct.
   - Seven number-clamping functions only forward to the same numeric expression. Replace them with one primitive; retain the scheduler's non-finite fallback and the prototype's distinct boundary ordering.

All seven groups are implemented. Repeat audits removed additional test-only result data, unused public generation metadata and duplicate gain normalization. Historical controllers/decoders remain live comparison controls; local one-line shape/type guards and separately named editing capabilities retain their own concern ownership.

Validation on the final product source:

- `pnpm test`: 229 tests across 44 files passed. Added EBML parsing and fade-envelope coverage; meaningful lifecycle tests remain after their unused probe state and implementation-only snapshot assertions were removed.
- `pnpm build`, product TypeScript, prototype TypeScript and all six verifier TypeScript projects passed.
- `pnpm check`, `pnpm lint` and `git diff --check` passed; no thresholds or test scopes were weakened.
- The prototype's 18 behavior tests and isolated build passed, and its actual browser playback/pause smoke passed.
- Both FFmpeg fixture sets were regenerated through the shared EBML parser with their original packet/cue assertions intact.
- Scrub comparison: 48 browser trials passed against the immutable historical indexed reference, measuring the actual current direct provider.
- Real waveform and silent-range app workflows passed, including worker generation, playback, export/download, independent PCM/video checks, artifact invalidation and Close file/re-import. Waveform was rerun after the direct-array pull contract change.
- A/V pilot: all nine events at each of 0.5×, 1× and 2× passed. This remains pilot evidence and makes no physical A/V alignment qualification claim.
- Both shared bounded-audio runs passed all five 30-second trials and functional checks, including deliberate stalls, zero underruns, memory, timer, source-churn and cleanup gates. Historical evidence files were restored byte for byte; new reports remain under `tmp/dedup-bounded-{baseline,candidate}.json`.
- Final file-backed served-runner comparison passed all four buffered/OPFS exports in Chrome for Testing. The original strict inspector passed exact encoded video/audio packet parity, timing, reservations and reserved-moov layout checks. Its PCM instrumentation now reads the simplified direct AudioBuffer correctly; the parity gate was not relaxed.
- Brave's two buffered control exports varied in decoded PCM before any transport comparison. A separate constant-PCM control on the same localhost origin read rendered 0.5 as approximately 0.49983–0.49995 in Brave, while Chrome for Testing read exactly 0.5 on all three pages. This records the browser difference without attributing a mechanism or treating it as a product refactor failure. Control evidence is in `tmp/dedup-audio-browser-controls.json`.
- Native gain/routing/cleanup verification passed all 21 checks and three candidate-ramp checks after the final gain-boundary cleanup.
- Three independent cross-reviews plus an unused-export/dependency scan were completed. Traced findings were fixed, and no further worthwhile duplicate/stale implementation remained in the audited paths. The import graph has no cycles.

No ADR, persisted preset format, intended UI behavior or historical evidence contract changed. Earlier working-tree changes remain preserved.
