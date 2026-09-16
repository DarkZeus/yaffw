---
version: 1
slug: "src-editor-next-route-entry-editornextroute-tsx"
primary_target: "src/editor-next/route/entry/EditorNextRoute.tsx"
related_targets: ["src/editor-next/route/entry/editor-next-route-composition.tsx","src/editor-next/workbench/frame/editor-workbench.tsx","src/editor-next/preview/player/native-preview-player.tsx","src/styles.css"]
---

# Root editor workbench

## Scope and mode

- Scope: `/` ready-state editor composition; non-ready and unsupported states remain functional and inherit the rebuilt world.
- Mode: Operate.
- Audience scene: one person making a quick, occasional desktop edit to one local media asset.

## Job and constraints

- Make preview, range selection, audio monitoring/mix decisions, and export available without a multi-asset project model.
- Preserve every existing editor behavior, keyboard shortcut, selection interaction, preview resource boundary, export flow, and accessibility name.
- Desktop is primary; compact widths may stack but must remain usable.

## Locked direction

- Approved reference: `.impeccable/mocks/approved-user-sketch.png`.
- The sketch's topology is authoritative: narrow vertical tool rail; contextual inspector above the lower-left audio area; preview above the lower-right single-asset timeline; aligned horizontal and vertical splits.
- Borrowed transform, appearance, layer, and plugin controls in the sketch are explicitly excluded. Populate the structure only with existing YAFFW Media, Audio, and Export functionality.
- Dark graphite matte work surfaces, cool teal selection/meter accent, red playhead, compact 10–13px UI typography, crisp one-pixel separators, and restrained 3–4px control corners.

## Memorable working moment

The loaded media dominates the upper canvas while the selected range remains visually continuous through thumbnails and waveform below; the left column changes tools without displacing either.

## Unresolved decisions

- None blocking. Exact splitter persistence and compact-width stacking should follow existing project conventions.
