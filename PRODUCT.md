# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

YAFFW is for individuals editing personal video in a supported desktop browser. They want to load local media, inspect it precisely, choose the part to keep, control how its audio contributes, and produce a usable output without first uploading the source or adopting a multi-asset editing project.

## Product Purpose

YAFFW is a local-first media editor for personal video editing workflows. Its primary workflow takes one active media asset from local import through preview, media-time Selection, audio decisions, export review, browser-local generation, and an explicit Delivery action.

Success means a user can make and review precise editing decisions, understand the current runtime's capabilities and limitations, and produce Generated media while keeping the core editing path local.

## Positioning

YAFFW combines a focused, professional-style editor workbench with a deliberately single-asset product model. It offers more inspection and output control than a basic browser trimmer without becoming a multi-asset nonlinear editor or requiring server-backed project infrastructure.

Browser-local processing is the primary mechanism. External URL acquisition and standalone bulk download are import utilities, not the center of the product or the shape of the editor core.

## Operating Context

- The canonical editor is the `/` route; `/editor-next` redirects to it.
- A session centers on one active media asset and the Editing decisions for that asset.
- The workflow moves through local import, asset analysis, preview, Selection and audio decisions, Output settings, Export review, an Export job, Generated media, and a separate Delivery action.
- Users work in a dense, viewport-height editor workbench with preview, transport, Selection and Waveform context, media facts, audio controls, and export state.
- Standalone bulk download remains available at `/bulk-download` in local environments and stays separate from editor behavior.

## Capabilities and Constraints

- The primary input is a local video file. Video-only media and video with optional audio tracks are supported; audio-only editing and subtitle workflows are deferred.
- YAFFW previews the active media asset, supports playhead and frame-oriented navigation, and represents Selection as a half-open integer-microsecond media-time range.
- Audio mix decisions can include or exclude source audio tracks and adjust Track volume. Preview-only monitoring state remains distinct from generated-output decisions.
- Users can choose documented Output settings and browser-local Export presets, review the planned output, run a browser export, recover from failure or cancellation, and explicitly deliver Generated media.
- The editor requires the standards-based media APIs used by the workflow and is Chromium/WebCodecs-first. Unsupported runtimes are blocked with an explicit explanation rather than receiving a reduced editor.
- Editor processing and export remain browser-local. There is no server export fallback, native FFmpeg path, or silent output-profile fallback in the current product.
- The active editing session and its media are not persisted as a project across page refreshes. Browser-local workbench layout preferences and Output setting presets may persist without becoming editing projects.
- Acquisition code, URL download behavior, and bulk download must not shape the editor core.
- The product remains a single-asset editor until a future workflow provides concrete evidence for a broader model.
- Selected-range export is best effort until real browser-runner evidence proves requested start and end boundaries; the product must not claim precision beyond the evidence on hand.

## Brand Commitments

- The product name is **YAFFW**.
- Do not expand the name in product UI or describe the product as an FFmpeg wrapper.
- Use the domain language defined in `CONTEXT.md`, including Media asset, Selection, Generated media, Delivery action, and Editor workbench.
- Product communication should be direct about capability limits and should not disguise unsupported behavior as a successful fallback.
- The editor's visual craft should sit alongside DaVinci Resolve and Final Cut Pro while preserving the immediate simplicity of CapCut Desktop. Use familiar professional media-editor grammar without importing a multi-asset project model or unnecessary NLE chrome.

## Evidence on Hand

- `CONTEXT.md` is the authority for the current product model, relationships, and domain language.
- `README.md` documents the canonical surfaces, current editor capabilities, stack, and development workflow.
- `docs/adr/` records architectural decisions, including browser-local processing, capability-based runtimes, the WebCodecs requirement, the absence of server export fallback, and promotion of editor-next to the canonical route.
- `docs/export-correctness-browser-baseline.md` records current browser export evidence and its explicit limits.
- `public/export-correctness-fixtures/` contains repeatable video-only, audio, multi-audio, and synchronization fixtures used by the export and preview evidence harnesses.
- Automated tests cover the editor core, route composition, media analysis, preview behavior, Selection, audio, Output settings, export planning, failure recovery, and generated-media inspection.
- There are no testimonials, customer logos, usage benchmarks, pricing claims, or broad browser-compatibility evidence on hand; future surfaces must not fabricate them.

## Product Principles

1. Keep the media and the primary processing path local whenever the supported runtime can do the work.
2. Optimize the entire experience for one active media asset rather than importing assumptions from project-based nonlinear editors.
3. Keep Editing decisions, preview state, generated output, and Delivery actions conceptually separate so users can understand what will change their result.
4. Expose runtime and export limitations honestly, with explicit failure and recovery instead of silent fallback.
5. Let concrete workflow evidence earn added complexity; do not broaden the product model speculatively.
