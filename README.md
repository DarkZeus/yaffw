# YAFFW

YAFFW is a local-first media editor for personal video editing workflows. The current rewrite centers on `editor-next`: a single-asset editor workbench for loading a local video, previewing it, choosing a media-time Selection, reviewing export capability, running a browser export job, and explicitly delivering the Generated media.

The long-term product is no longer an FFmpeg-wrapper UI. Legacy server-backed editor and bulk-download routes still exist while the browser-first editor model is being proven, but new editor work should follow the domain language in [CONTEXT.md](./CONTEXT.md).

## Current Surface

- `/editor-next`: current rewrite path for local-file editing.
- `/`: legacy media editor surface.
- `/bulk-download`: legacy acquisition surface.

## Editor-Next Capabilities

- Local file import into a Ready media asset.
- Runtime gate for browser media APIs, with Chromium/WebCodecs as the primary target.
- Native video preview with playhead, frame stepping, playback speed, volume, fullscreen, and keyboard controls.
- Media-time Selection represented as half-open integer microsecond ranges.
- Selection handles, range dragging, read-only time labels, zoom, and waveform lanes for audio tracks when available.
- Export review for the default MP4/H.264/AAC output profile.
- Browser export through Mediabunny/WebCodecs with explicit Generated media delivery.
- Export failure and cancellation recovery that keeps the active media asset and Selection retryable.

## Export Correctness

The current export truth is documented in [docs/export-correctness-browser-baseline.md](./docs/export-correctness-browser-baseline.md).

Short version:

- Full-asset browser export is the strongest current path when the default profile is supported.
- Selected-range browser export uses Mediabunny conversion as the intended precision path, but it should not be described as proven precise until real-runner generated-media evidence proves requested duration plus start/end boundaries.
- Native FFmpeg is not the next step. It should be considered only if real Mediabunny boundary or audio/video alignment measurements expose a browser limitation that cannot be fixed in the browser runner.

## Project Docs

- [CONTEXT.md](./CONTEXT.md): domain language and current product model.
- [docs/adr](./docs/adr): architectural decision records. Keep these as durable decision history; add a new ADR or mark one superseded instead of deleting useful decisions.
- [docs/export-correctness-browser-baseline.md](./docs/export-correctness-browser-baseline.md): current browser export evidence and follow-up direction.
- [docs/editor-next-future-subtitles.md](./docs/editor-next-future-subtitles.md): deferred subtitle support notes.

Completed PRDs and issue implementation plans should stay in GitHub issue history rather than as long-lived repo docs once their decisions are captured in ADRs, `CONTEXT.md`, tests, or current baseline docs.

## Tech Stack

- React 19 and TypeScript.
- TanStack Router and TanStack Query.
- Tailwind CSS and shadcn-style Radix components.
- Mediabunny and WebCodecs for browser media analysis/export.
- Hono server routes for legacy upload, URL acquisition, and bulk-download workflows.
- Vitest for tests.

## Development

Install dependencies:

```bash
pnpm install
```

Run the full legacy-plus-frontend development stack:

```bash
pnpm dev
```

Run only the Vite frontend on port 3000:

```bash
pnpm frontend
```

Verify the editor-next TypeScript boundary:

```bash
npm run typecheck
```

Run tests:

```bash
npm run test
```

Build:

```bash
npm run build
```

## Working Rules

- Prefer browser-local editor processing for editor-next.
- Keep acquisition and bulk download behavior out of the editor core.
- Model generated media separately from delivery actions.
- Preserve the single-asset editing session model until a future feature earns a broader model.
- Do not add server export fallback, native FFmpeg, smart rendering, custom output settings, or generated-media preview without a concrete decision record.
