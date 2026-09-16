# YAFFW

YAFFW is a local-first media editor for personal video editing workflows. Its primary editor is `editor-next`: a single-asset editor workbench for loading a local video, previewing it, choosing a media-time Selection, reviewing export capability, running a browser export job, and explicitly delivering the Generated media.

The product is no longer an FFmpeg-wrapper UI. Browser-local editor processing is the primary path. New editor work should follow the domain language in [CONTEXT.md](./CONTEXT.md).

## Current Surface

- `/`: canonical editor-next surface for local-file editing.
- `/editor-next`: compatibility redirect to `/`.

## Editor-Next Capabilities

- Local file import into a Ready media asset.
- Cinema workbench with resizable preview/inspector and Selection areas, plus Media, Audio, and Export inspector tabs.
- Runtime gate for browser media APIs, with Chromium/WebCodecs as the primary target.
- Native video preview with playhead, frame stepping, playback speed, volume, fullscreen, and keyboard controls.
- Web Audio preview engine for audio monitoring and playback timing when active; native video follows that clock. Includes per-track preview solo and level meters.
- Audio mix decisions for track inclusion, volume, and channel handling, separate from preview-only solo and global preview volume.
- Media-time Selection represented as half-open integer microsecond ranges.
- Selection handles, range dragging, read-only time labels, zoom, video thumbnails, and waveform lanes for audio tracks when available.
- Session-owned Output settings for documented container, video codec, Generated
  audio mix codec, downscale resolution, and independent video/audio quality or
  custom bitrate choices.
- No audio output option for exporting video without an audio track.
- Browser-local Export presets with draft-only loading, explicit Apply, and a
  system-managed Last used settings entry.
- Export review for the applied documented output profile, including its
  resolved resolution and Generated audio mix.
- Browser export through Mediabunny/WebCodecs with matching Generated media
  metadata and explicit delivery.
- Export failure and cancellation recovery that keeps the active media asset and Selection retryable.

## NLE Prototype

The standalone [NLE editor prototype](./prototypes/nle/README.md) is preserved for timeline exploration. Run it with `pnpm exec vite --config prototypes/nle/vite.config.ts`. It has its own media, tests, and build configuration and is not part of the deployed app.

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
- TanStack Router.
- Tailwind CSS and shadcn-style Radix components.
- Mediabunny and WebCodecs for browser media analysis/export.
- Web Audio for preview audio scheduling and metering; WaveSurfer for waveform rendering.
- Vitest for tests.

## Development

Use Node.js and **pnpm 10.33.0**, pinned in `package.json` through the `packageManager` field. Keep `pnpm-workspace.yaml` and `pnpm-lock.yaml` together: the workspace configuration contains dependency overrides used by the lockfile.

Install dependencies:

```bash
pnpm install
```

Run the Vite frontend on port 3000:

```bash
pnpm dev
```

The editor runs entirely in the browser; no upload server or FFmpeg installation is required.

Verify the editor-next TypeScript boundary:

```bash
pnpm run typecheck
```

Run tests:

```bash
pnpm run test
```

Build:

```bash
pnpm run build
```

The build produces `dist` and runs the editor-next TypeScript check. Preview the built frontend locally with `pnpm run serve`.

## Deployment

The Cloudflare deployment serves the built frontend as static assets. [wrangler.jsonc](./wrangler.jsonc) points to `dist` and enables single-page application fallback for client-side routes.

The configured build and deploy commands are:

```bash
pnpm run build
npx wrangler deploy
```

Dependency installation should use the pinned pnpm version and `pnpm install --frozen-lockfile`. Commit dependency configuration and lockfile changes together so the frozen installation remains reproducible.

## Working Rules

- Prefer browser-local editor processing for editor-next.
- Future acquisition features must enter through import adapters outside the editor core.
- Model generated media separately from delivery actions.
- Preserve the single-asset editing session model until a future feature earns a broader model.
- Do not add server export fallback, native FFmpeg, smart rendering, or
  Generated media preview without a concrete decision record.
