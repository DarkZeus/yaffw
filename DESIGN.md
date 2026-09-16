---
name: YAFFW
description: A graphite, dark-teal precision editing workbench for browser-local media.
colors:
  graphite-viewer: "#0b0f10"
  graphite-rail: "#0e1213"
  graphite-workbench: "#111516"
  graphite-timeline: "#121718"
  graphite-inspector: "#151a1b"
  graphite-lane: "#151b1c"
  graphite-ruler-transport: "#171d1e"
  graphite-lane-alt: "#1a2122"
  graphite-hover: "#222a2b"
  graphite-disabled: "#242b2c"
  structural-border: "#2a3334"
  loading-track: "#30393a"
  strong-border: "#3a4647"
  waveform-guide: "#526361"
  muted-foreground: "#82908d"
  rail-foreground: "#9ca9a6"
  workbench-foreground: "#d8e2e0"
  selected-ink: "#071615"
  signal-teal: "#22a79b"
  focus-teal: "#43c6b9"
  playhead-red: "#ed5b4f"
  destructive-red: "#d94e43"
typography:
  wordmark:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
  instrument:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "9px"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.13em"
  meter:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace"
    fontSize: "7px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
rounded:
  square: "0px"
  fine: "2px"
  instrument: "3px"
  standard: "4px"
  overlay: "8px"
  full: "9999px"
spacing:
  hairline: "1px"
  half: "2px"
  compact: "4px"
  control: "6px"
  cluster: "8px"
  panel: "12px"
  section: "16px"
  state: "24px"
components:
  transport-primary:
    backgroundColor: "{colors.signal-teal}"
    textColor: "{colors.selected-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.instrument}"
    padding: "0px"
    height: "28px"
    width: "28px"
  transport-button:
    backgroundColor: "{colors.graphite-viewer}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.instrument}"
    padding: "0px"
    height: "28px"
    width: "28px"
  compact-input:
    backgroundColor: "{colors.graphite-workbench}"
    textColor: "{colors.workbench-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.instrument}"
    padding: "4px 6px"
    height: "28px"
  tool-trigger:
    backgroundColor: "{colors.graphite-rail}"
    textColor: "{colors.rail-foreground}"
    rounded: "{rounded.square}"
    padding: "0px"
    height: "48px"
    width: "48px"
  status-chip:
    backgroundColor: "{colors.graphite-hover}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.instrument}"
    rounded: "{rounded.fine}"
    padding: "2px 6px"
  workbench-zone:
    backgroundColor: "{colors.graphite-inspector}"
    textColor: "{colors.workbench-foreground}"
    rounded: "{rounded.square}"
    padding: "0px"
---

# Design System: YAFFW

## Overview

**Creative North Star: "The Precision Editing Instrument"**

YAFFW is a compact desktop editing instrument built from matte graphite fields, crisp alignment, and restrained dark-teal signal color. The loaded Media asset owns the upper canvas while its Selection, Waveform, audio state, and export facts remain continuously available around it. The interface should feel closer to a calibrated monitor or mixer than to a content dashboard.

The workbench is dense by design. Its hierarchy comes from topology, one-pixel separators, and small differences between adjacent graphite surfaces—not from nested cards, decorative headings, or generous empty space. Teal marks selection, waveform, progress, active tools, and primary transport; red is reserved for the playhead and destructive or blocking state.

**Key Characteristics:**

- Viewport-height, single-asset desktop editor with an aligned four-zone composition.
- Matte cool graphite surfaces with dark teal and red as the only persistent signal hues.
- Compact system typography and monospaced instrument readouts spanning an intentional 7–15px scale.
- Square permanent regions, crisp one-pixel separators, and 3–4px working controls.
- Icon-led tool switching with meaningful labels inside the active work area, not persistent decorative chrome.

## Colors

The palette is cool, low-chroma graphite. It recedes behind the Media asset while maintaining enough tonal separation to scan the rail, inspector, viewer, mixer, transport, and timeline as one machine.

### Primary

- **Signal Teal**: The sole active-editing color. It marks the selected tool, primary play control, Selection edges and fill, Waveform data, meters, progress, and successful or healthy state.
- **Focus Teal**: A brighter relative used for keyboard focus boundaries and focus rings. It exists for state legibility, not as a second decorative accent.

### Tertiary

- **Playhead Red**: Current media-time position only. Its isolation lets the playhead remain obvious through thumbnails and waveforms.
- **Destructive Red**: Failure, invalid state, destructive action, and clipping alerts. Never use it as a substitute for the playhead.

### Neutral

- **Graphite Viewer**: The deepest field and media aperture.
- **Graphite Rail**: The recessed tool strip at the far edge of the workbench.
- **Graphite Workbench**: The global editor and top-bar ground.
- **Graphite Timeline**: The single-asset Selection timeline ground.
- **Graphite Inspector**: The shared surface for the upper-left inspector and lower-left mixer.
- **Graphite Lane / Alternate Lane**: Track, waveform, and selected-range working surfaces.
- **Graphite Ruler / Transport**: The time ruler and transport strip; their shared tone binds the preview and timeline.
- **Graphite Hover, Disabled, and Loading**: State-specific fills that remain inside the graphite family.
- **Structural Border / Strong Border**: One-pixel separators and the stronger edge used for controls, focusable apertures, and split handles.
- **Workbench Foreground, Rail Foreground, and Muted Foreground**: Primary, rail, and secondary text tiers.
- **Selected Ink**: Near-black content over filled teal controls.
- **Waveform Guide**: Muted teal-gray reference lines and supporting meter detail.

### Named Rules

**The Teal Signal Rule.** Teal means active editing, selected range, measurable signal, progress, or healthy state. It does not decorate static titles or fill arbitrary containers.

**The Red Position Rule.** Playhead Red locates current media time; Destructive Red reports danger. Keep the two roles distinct even though they share a hue family.

**The Media Owns Saturation Rule.** The interface remains chromatically restrained so the loaded video and its actual signal data carry the screen's visual energy.

## Typography

**Display Font:** System sans (with -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, and native fallbacks)
**Body Font:** System sans (same stack)
**Label/Mono Font:** Native monospace (with ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, and Courier New fallbacks)

**Character:** Typography behaves as labeling on an instrument: compact, calm, and exact. Sans text names actions and concepts; monospace stabilizes time, decibels, dimensions, codecs, percentages, frame rates, and other measured values.

### Hierarchy

- **Wordmark** (600, 15px, tight tracking): YAFFW in the 40px top bar; this is the largest persistent ready-workbench text.
- **Body / asset title** (400–500, 12px): The workbench default and the loaded asset's primary name.
- **Label** (500–600, 11px): Section headers, compact rows, transport context, tabs, and active control labels.
- **Instrument** (400–500, 10px): Media-time, decibels, percentages, codec/channel details, ruler labels, and dense audio controls.
- **Micro annotation** (500–600, 9px): Short timeline overlays, narrow badges, and uppercase technical annotations where space is physically constrained.
- **Meter calibration** (400–700, 7–8px): dB scales, clip markers, and axis ticks inside meters only.

### Named Rules

**The Instrument Scale Rule.** The 7–10px roles are intentional for meter calibration and short technical readouts, not a general text scale. Explanatory copy and ordinary interactive labels remain larger.

**The Readout Rule.** Use monospace and tabular numerals for values that users compare across time or channels; use system sans for language and actions.

**The No Display Type Rule.** The ready workbench does not introduce marketing-sized headings. Hierarchy is spatial and structural, with 15px as the persistent ceiling.

## Layout

The canonical ready surface is a viewport-height Operate-mode workbench beneath a 40px top bar. At desktop width, a 48px vertical tool rail sits on the far left. The remaining work area is divided into two aligned columns: a fixed 288px working column and a flexible main column. The working column holds the contextual Media/Audio/Export inspector above and the preview mixer below; the main column holds the preview above and the transport plus single-asset Selection timeline below.

The default horizontal split is 68% upper / 32% lower, resizable down to 38% and 22% respectively. The 288px column boundary is shared across both halves so inspector and mixer align exactly, just as preview and timeline align on the right. This continuous topology is more important than any individual panel treatment.

Ready desktop regions meet edge to edge with no outer padding and own their overflow. Below the extra-large breakpoint, the 48px rail becomes a horizontal tool strip and the ready workbench gains a tall scrollable minimum canvas. Below the large breakpoint, each 288px/flexible row stacks vertically, keeping the working region 288px high and the preview or timeline at least 384px high. Compact behavior preserves usable instruments rather than shrinking controls below their designed scale.

Spacing follows a dense, mostly four-based rhythm: 2–4px between related transport controls, 6–8px inside compact clusters, 10–12px at panel edges, 16px for ordinary state surfaces, and 24px only for empty, unsupported, or modal states. Split handles and borders are functional geometry, not visual gutters.

### Named Rules

**The Aligned Workbench Rule.** Preserve the 48px rail, shared 288px working column, and 68/32 vertical split unless a responsive breakpoint explicitly stacks them.

**The One Asset Topology Rule.** Preview stays upper-right and the single-asset timeline stays lower-right. Do not introduce bins, layers, or a multi-track project canvas that displaces this relationship.

## Elevation & Depth

Permanent workbench regions are flat. Depth comes from adjacent graphite tones, clipping, and one-pixel borders; the selected range uses crisp teal edges and a translucent teal fill with no resting glow. Small control shadows may provide a slight tactile edge, while strong shadows are confined to floating preset menus, transient popovers, the import drop response, and the Output settings dialog.

### Named Rules

**The Flat Machine Rule.** Inspector, mixer, viewer, transport, and timeline never float above one another. If a region persists in the grid, separate it with tone and a one-pixel rule rather than shadow.

**The Overlay Exception Rule.** Strong elevation signals temporary occlusion. Use it only when a menu, dialog, or transient state genuinely sits above the workbench.

## Shapes

The workbench silhouette is rectilinear. Permanent rail, inspector, mixer, viewer, transport, and timeline zones are square where they meet. Dense working controls use fine 2px, instrument 3px, or standard 4px corners; 8px rounding belongs to dialogs and non-ready import surfaces, not the ready grid. Full pills are limited to continuous physical controls such as slider tracks, thumbs, and meter indicators.

Borders are frequent but quiet. Structural Border defines zone and row separation; Strong Border marks control apertures, focusable boundaries, and resizable seams. Selection boundaries remain square and directional.

### Named Rules

**The Instrument Corner Rule.** Default to 3–4px on controls and 0px on permanent regions. Larger rounding must correspond to a genuinely separate overlay or non-ready state.

## Components

Components are compact, bordered instruments. State is communicated by an explicit combination of fill, text or icon color, border, and focus treatment—not by decorative badges or prose.

### Buttons

- **Shape:** Primary transport and most icon buttons are 28px square with 3px corners; standard form buttons may be 32px high with 2–4px corners.
- **Primary:** Signal Teal with Selected Ink. In the ready workbench this is reserved for the principal transport or committed action.
- **Secondary / Outline:** Graphite Viewer or Workbench with Structural Border and Muted Foreground; hover moves to Graphite Hover and Workbench Foreground.
- **Pressed:** A translucent teal fill, teal border or icon, and `aria-pressed` semantics make toggles legible without turning the whole tool strip teal.
- **Focus / Disabled:** Focus uses Focus Teal plus a restrained three-pixel translucent ring. Disabled controls use the disabled graphite fill, muted text, and reduced opacity.

### Chips

- **Style:** Fine 2px corners, one-pixel border, 2px × 6px padding, and 9–11px content depending on available instrument space.
- **State:** Use chips only for concise format, capability, range, channel, export, or failure facts. Static section identity remains plain text separated by a rule.

### Cards / Containers

- **Corner Style:** Permanent ready-workbench containers are square. Non-ready surfaces and dialogs may use 2–8px rounding according to separation and scale.
- **Background:** Choose the semantic zone token—Inspector, Viewer, Timeline, Lane, or Transport—rather than wrapping content in another generic surface.
- **Shadow Strategy:** None at rest. See Elevation & Depth for transient exceptions.
- **Border:** One pixel at zone boundaries and between factual rows.
- **Internal Padding:** Prefer row padding of 8–12px; do not add a second padded card inside an already bounded panel.

### Inputs / Fields

- **Style:** 28–32px high, 2–4px corners, graphite fill, Strong Border, and compact 6–12px horizontal padding.
- **Focus:** Focus Teal border with a two- or three-pixel translucent ring depending on control density.
- **Error / Disabled:** Destructive Red for invalid state; disabled graphite, muted text, and reduced opacity for unavailable controls.

### Navigation

The ready editor has no legacy application sidebar. It uses a 48px tool rail with one 48px icon trigger per Media, Audio, and Export context. The active tool receives a translucent teal field, teal icon, and a two-pixel teal edge indicator. Names remain available through accessible labels and title/tooltips; persistent text beside every icon would weaken the compact workbench.

At narrower widths, the same tool set rotates into a 48px horizontal strip. Its order and active-state semantics do not change.

### Selection Timeline

The timeline is a single-asset precision surface, not a composition timeline. A 40px transport strip sits above a ruler, video thumbnails, Waveform lanes, square teal Selection boundaries, translucent selected-range fill, monospaced time labels, and a thin red playhead. The selection stays visually continuous through the media and audio lanes.

### Preview Mixer

The lower-left mixer shares the inspector's 288px width and begins with a 40px header. Compact vertical volume and channel meters use teal for level, restrained warning colors near clipping, and 7–10px calibration text. Monitoring state remains visibly separate from output mix decisions.

### Output Settings Dialog

Output settings are a focused overlay and may use their scoped cooler blue-graphite token set and strong overlay shadow. Keep that alternate scope inside the dialog; closing it must return the user to the unified graphite workbench.

## Do's and Don'ts

### Do:

- **Do** preserve the aligned 48px rail, 288px inspector/mixer column, 68/32 split, upper-right preview, and lower-right timeline.
- **Do** use Signal Teal consistently for selection, meters, progress, primary transport, and active-tool state.
- **Do** use one-pixel separators and small graphite tone shifts before adding padding, rounding, or shadow.
- **Do** keep measured values monospaced and reserve the 7–9px roles for meters and constrained technical annotations.
- **Do** keep Media, Audio, Export, preview state, Selection, and Delivery state visually distinct without inventing a multi-asset project model.

### Don't:

- **Don't** create nested cards inside the inspector, mixer, viewer, or timeline; use rows, rules, and shared zone surfaces.
- **Don't** restore the legacy labeled sidebar or place a second navigation shell around the 48px workbench rail.
- **Don't** add decorative persistent labels to icon tools or badge static section names; labels must communicate current content, action, or state.
- **Don't** reintroduce warm blacks, gold selection accents, gradients, decorative glow, or glossy consumer-creator styling.
- **Don't** use strong shadows on permanent regions or soften the ready workbench into floating rounded panels.
- **Don't** turn the Selection timeline into a multi-asset NLE with bins, layers, tracks, or unrelated professional-editor chrome.
