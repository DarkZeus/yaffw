# YAFFW landing — design notes

## Purpose and maintained implementation

The landing introduces YAFFW's personal, local-first video editing workflow and links to the separate editor. It also publishes a hand-written changelog. The product edits one local video at a time; the landing is a static marketing site with illustrative browser interactions, rather than another media editor.

The maintained site is the `yaffw-landing` Astro package in this pnpm workspace. From the repository root, use the supported Node version and pinned pnpm version described in [README.md](../README.md):

```sh
pnpm install --frozen-lockfile
pnpm --filter yaffw-landing dev       # development, port 4173
pnpm --filter yaffw-landing build     # static output in landing/dist
pnpm --filter yaffw-landing preview   # preview the built site, port 4173
```

Build before previewing or deploying; the development command compiles on demand. Opening the source files directly does not run Astro. The root editor development command uses port 3000; it is separate from the landing.

Deployment serves `landing/dist` through the `yaffw-landing` Cloudflare Worker configured in `landing/wrangler.jsonc`. See [the landing README](README.md#deploy) for the deployment commands and Workers Builds setup. Deploying requires the appropriate Cloudflare account access. The Astro configuration, package scripts, and Worker configuration are the maintained owners of build and deployment behavior.

## Visual system in the shipped site

- The shared palette is owned by `src/workbench-tokens.css` at the repository root. Both the editor and `landing/src/styles/index.css` import it. The landing's `<html class="workbench">` applies the palette; `landing/src/styles/base.css` maps semantic aliases and defines landing-specific derived values. The editor's `src/styles.css` consumes the shared palette rather than owning it.
- All authored colors use OKLCH, achromatic hues use `none`, and mixes use `color-mix(in oklch, …)`. Neutral dark surfaces leave the product screenshot prominent. Gold identifies selection and the product mark; red identifies the playhead. Primary buttons use the shared light foreground and dark workbench colors.
- The hero uses a split composition: text on the left and a real workbench screenshot extending toward the right edge, with a warm background wash, rounded clipping, a highlighted rim, and shadow. It has a finite staggered opacity/vertical entrance. There is no hero blur entrance, perspective tilt, or scroll-driven flattening.
- The feature grid uses compact product illustrations for audio, formats, panel arrangement, presets, and preview. Borders have a restrained lit top edge. A pointer-following light enhances cards on fine-pointer devices.
- Meaningful secondary text shares the muted foreground token; size, spacing, and weight carry the remaining hierarchy. The header has a stronger dark glass ground for contrast over the product image. The local-processing diagram quiets its web-side border after the code arrives while keeping its explanation fully readable. Dark viewer-token backing plates keep the demo playback readouts legible over bright scenery.
- Geist and Geist Mono are requested as web fonts, with system sans-serif and monospace fallbacks. Large headings, smaller muted explanations, and monospaced media-time readouts establish the hierarchy.

## Demonstration fidelity and enhancement

The screenshot shows the real editor. The selection demo and keyboard playground simulate a fixed-duration, nominal-30-FPS asset with generated scenery, thumbnail backgrounds, and a deterministic waveform. They do not load, decode, mix, export, or download a visitor's media. The export action opens the real editor. Feature-card meters, format cycling, layout changes, and export progress are illustrative.

The simulated timelines share `landing/src/scripts/timeline.js`. Their current sample starts with a partial Selection and looping enabled; playback currently stays within that sample Selection. Those are known differences from the editor's initial whole-file Selection, loop-off setting, and asset-wide playback, tracked in [#154](https://github.com/DarkZeus/yaffw/issues/154). The demo is not a guarantee of frame-precise exported boundaries or runtime codec availability.

Static HTML includes the headings, factual copy, default runnable commands, timeline illustrations, and scene stills. Demo buttons and command tabs/Copy appear only after their handlers attach. Copy failure selects the runnable command text and supplies accessible manual-copy instructions. Run/Develop tabs use automatic activation with wrapping arrow navigation and named focusable panels. See [the enhancement contract](README.md#progressive-enhancement) and [built-site checks](../verification/landing/README.md).

Motion follows the implementation's actual limits:

- After initialization succeeds, newly entering content below the viewport may fade/rise into view. Content already visible, including a deep-linked heading, is not hidden at initialization.
- The scene camera follows the simulated Playhead; it is not a scroll effect. JavaScript illustration loops and meter updates pause offscreen. The three-step cards also have decorative CSS keyframe loops.
- Reduced motion stops JavaScript illustration loops, freezes scene-camera motion, collapses CSS keyframe durations, and disables native cross-document view transitions. Explicit demo transport still works; short control transitions and command-label fades remain.
- Section links keep native fragments, sharing, refresh, and browser history; section targets are focusable without JavaScript and CSS scroll padding keeps them below the fixed header. No session-storage handoff is used.
- Supported browsers use native cross-document page transitions. The header remains spatially stable while page content fades and settles vertically. Other browsers navigate normally.

## Historical reference research

The earlier November 2026 research pass recorded these observations. This is design provenance, not a fresh audit of those sites or a list of effects implemented in YAFFW.

| Reference | Recorded observation                                                                               | Rationale retained here                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Raycast   | Dark canvas, a concentrated brand light source, real product UI, keycap-like controls              | Let a real product screenshot carry the hero; use restrained warm light and recognizable keycaps               |
| Linear    | Blur/fade entrances, two-tone copy, a tilted screenshot that flattens on scroll, monospaced labels | Strong type hierarchy and compact media-time labels; the recorded blur and perspective effects are absent here |
| Notion    | Confident typography, generous space, feature cards with small illustrations                       | Give each feature a concise explanation and one relevant illustration                                          |
| Resend    | Near-black gradients, hairline borders, a glossy hero object                                       | Use subtle edge lighting and depth around product objects                                                      |
| Vercel    | Strict grid and restrained color                                                                   | Reserve chromatic accents for meaningful product cues                                                          |

## Future work and documentation ownership

Reference ideas are not commitments. Proposed blur, perspective, or other hero effects remain unimplemented unless a later issue explicitly chooses and delivers them. Demo fidelity repairs and changes to the page's narrative must describe the resulting behavior rather than preserving claims about the earlier prototype.

Every later design, motion, demo, asset-pipeline, navigation, or tooling change must update the affected statements in these notes and the landing README in the same issue before completion. Keep shipped behavior, known limitations, and proposed changes distinct, and verify descriptions against the current source and runnable package commands.
