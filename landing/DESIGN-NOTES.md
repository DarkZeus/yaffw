# YAFFW landing — design notes

## Purpose and maintained implementation

The landing introduces YAFFW's personal, local-first video editing workflow and links to the separate editor. It also publishes a hand-written changelog. The product edits one local video at a time; the landing is a static marketing site with illustrative browser interactions, rather than another media editor.

The complete current editor is the hero's dominant visual. The Selection chapter explains the compact open-file, selection, and export-review/download workflow with a real timeline detail. An optional Explore Selection controls disclosure retains the existing simulation and explicitly identifies its limits. Real Audio and Export panel captures replace the feature mockups. Keyboard help and its playground remain optional inside the native Try keyboard controls disclosure. Source commands, acknowledgments, limitations, planned capabilities, and footer navigation remain available.

The maintained site is the `yaffw-landing` Astro package in this pnpm workspace. From the repository root, use the supported Node version and pinned pnpm version described in [README.md](../README.md):

```sh
pnpm install --frozen-lockfile
pnpm --filter yaffw-landing dev       # development, port 4173
pnpm --filter yaffw-landing build     # static output in landing/dist
pnpm --filter yaffw-landing preview   # preview the built site, port 4173
```

Build before previewing or deploying; the development command compiles on demand. Opening the source files directly does not run Astro. The root editor development command uses port 3000; it is separate from the landing.

Deployment serves `landing/dist` through the `yaffw-landing` Cloudflare Worker configured in `landing/wrangler.jsonc`. See [the landing README](README.md#deploy) for the deployment commands and Workers Builds setup. Deploying requires the appropriate Cloudflare account access. The Astro configuration, package scripts, and Worker configuration are the maintained owners of build and deployment behavior.

## Visual system in the maintained site

- The landing uses a white canvas and neutral black ink, with secondary ink at 64% alpha. All authored values are OKLCH; neutral hues use `none`. The editor’s shared `src/workbench-tokens.css` supplies both light and dark palettes. Scoped `.product-surface` regions retain the editor palette inside control examples rather than inheriting the landing's light chrome.
- A left-aligned hero pairs a direct headline with the explanation and editor action, followed by a complete real editor screenshot. A 1160px content measure, medium-weight Inter headings, restrained 8px radii, and generous chapter transitions establish hierarchy. Media remains undistorted; the Selection chapter deliberately clips a detail from the same screenshot.
- Audio and Export are real panel captures, with their original semantic colors. Neutral backplates group each screenshot with its explanation. Supporting layout, preset, and preview capabilities use text rather than invented product UI.
- The local-first chapter uses one pale neutral band and a static file → browser → export explanation. No gradients, glows, floating shadows, pointer lights, or perpetual illustration loops surround the product.
- Inter supplies the landing's headings, body text, navigation, and buttons; Geist Mono supplies code and media-time readouts. Both are self-hosted through pinned Fontsource packages, retain system fallbacks, and use swap loading; the Latin Inter font is preloaded. Product naming and the existing gold icon remain unchanged. Small icon instances use responsive WebP transforms.
- Shared navigation, changelog, 404, and footer inherit the light landing system. The editor now also offers a real light appearance, selected through its own persistent Appearance control. Native page transitions remain; the prior hero/reveal and decorative-loop animations are removed.

See [the reference investigation](DESIGN-RESEARCH.md) for the inspected Mahlke/Hume references, the structural diagnosis, and the choices adapted to YAFFW.

`src/assets/workbench-current.jpg` is a capture of the running editor; `audio-panel.jpg` and `export-panel.jpg` are captures of its real panels using the existing repository sample. Astro supplies AVIF/WebP with JPEG fallbacks and reserves intrinsic dimensions. The full hero loads eagerly; Selection details and feature panels load lazily. There is no decorative CTA image. The social-sharing image is a separate 1200×630 typographic PNG. `src/social/card.html` defines its neutral canvas, Inter hierarchy, YAFFW mark and factual copy in HTML/CSS with OKLCH colors. `src/pages/og.png.ts` renders it through Takumi at build time with local assets; social metadata points to `/og.png`.

The screenshot's responsive candidates include 640px and 1400px widths to reduce excess mobile transfer while retaining the existing crop and high-density rendering. The free-access note in the hero matches the application metadata. The SEO audit adds no marketing sections or new visual system.

## Demonstration fidelity and enhancement

The screenshot shows the real editor. The optional Selection example and keyboard playground simulate a fixed-duration, nominal-30-FPS asset with a deterministic waveform. They do not load, decode, mix, export, or download a visitor's media. The export action opens the real editor. The former feature-card meters, format cycling, and layout animations are removed.

The control examples omit the generated video viewer and thumbnail scenes; the real screenshots carry the visual explanation. The simulated timelines share `landing/src/scripts/timeline.js`. Both start with the whole file selected, Playhead at zero, and Selection loop off. Playback can begin outside the Selection and continues to the asset end with looping off; looping waits until playback enters the Selection before wrapping. Body dragging moves the Selection without moving the Playhead, edge dragging scrubs a local preview before release, and cancellation discards the draft. Keyboard boundary commands preserve the Playhead and a valid range; frame steps pause playback.

The simulation deliberately uses a fixed 93.525-second asset and nominal 30 FPS, stored as lightweight seconds-based UI state. The actual editor uses analyzed media and integer-microsecond domain state. The illustrative waveform and nominal frame timing do not guarantee frame-precise exported boundaries or runtime codec availability.

Static HTML includes the headings, factual copy, default runnable commands, timeline illustrations. Demo buttons and command tabs/Copy appear only after their handlers attach. Copy failure selects the runnable command text and supplies accessible manual-copy instructions. Run/Develop tabs use automatic activation with wrapping arrow navigation and named focusable panels. See [the enhancement contract](README.md#progressive-enhancement) and [built-site checks](../verification/landing/README.md).

Interaction and motion follow the implementation's actual limits:

- Both control examples are native disclosures. Closing one stops its playback, cancels its unfinished selection gesture, and disables its shortcut handling. Static help remains available without JavaScript.
- Explicit transport updates the illustrated Playhead. There are no scene-camera or offscreen decorative animation loops.
- Below 1080px, section links and Changelog move into the native Menu disclosure. Home, Open editor, and the menu remain visible. The enhanced header is sticky; without scripts an open menu stays in document flow. Escape/outside dismissal and native fragments/history remain.
- Header text uses rem units and wraps at enlarged text sizes. Compact controls retain 44px targets. CSS scroll padding reserves clearance from the header.
- Supported browsers retain native cross-document transitions. Reduced motion disables them; other browsers navigate normally.

## Historical reference research

The earlier November 2026 research pass recorded these observations. This is design provenance, not a fresh audit of those sites or a list of effects implemented in YAFFW.

| Reference | Recorded observation                                                                               | Rationale retained here                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Raycast   | Dark canvas, a concentrated brand light source, real product UI, keycap-like controls              | Let a real product screenshot carry the hero; use restrained warm light and recognizable keycaps               |
| Linear    | Blur/fade entrances, two-tone copy, a tilted screenshot that flattens on scroll, monospaced labels | Strong type hierarchy and compact media-time labels; the recorded blur and perspective effects are absent here |
| Notion    | Confident typography, generous space, feature cards with small illustrations                       | Give each feature a concise explanation and one relevant illustration                                          |
| Resend    | Near-black gradients, hairline borders, a glossy hero object                                       | Use subtle edge lighting and depth around product objects                                                      |
| Vercel    | Strict grid and restrained color                                                                   | Reserve chromatic accents for meaningful product cues                                                          |

## Page identity

Production identity comes from the confirmed public `config/deployment.json` setting, with an optional explicit `LANDING_SITE_ORIGIN` build override; no request host, preview domain or editor destination supplies it. Home and changelog declare stable canonical paths and page-specific metadata. Explicitly unconfigured previews and the 404 template omit canonical/social identity and emit noindex; production builds require a valid origin. Sharing metadata points to the absolute production URL of the generated social card, with dimensions/type and descriptive alt. See the landing README for the confirmed origin and preview behavior.

The same production identity supplies robots/sitemap discovery and JSON-LD WebPage, WebSite and WebApplication identities. Only public content pages enter the sitemap. Preview builds publish no discovery URLs or structured identities. Cloudflare serves permanent canonical redirects and immutable hashed assets; arbitrary missing pages retain a genuine 404 status. See the [SEO audit](../docs/verification/seo-audit.md).

## Validation

`pnpm verify` preserves the editor gates and invokes landing validation, a single production build, and focused built-browser smoke checks. Astro templates have official Prettier formatting, Astro ESLint/a11y rules, and supported `astro check` typing with landing-local TypeScript 6; editor types remain on TypeScript 7. Generated HTML strings and ordinary JavaScript are not claimed as template lint/type-check coverage. Navigation/focus, command tabs, progressive demo initialization and built metadata are protected by the built browser checks; the preview uses an assigned loopback port and is cleaned up. See the landing README for commands and limits.

## Future work and documentation ownership

Reference ideas are not commitments. Proposed blur, perspective, or other hero effects remain unimplemented unless a later issue explicitly chooses and delivers them. Demo fidelity repairs and changes to the page's narrative must describe the resulting behavior rather than preserving claims about the earlier prototype.

Every later design, motion, demo, asset-pipeline, navigation, or tooling change must update the affected statements in these notes and the landing README in the same issue before completion. Keep shipped behavior, known limitations, and proposed changes distinct, and verify descriptions against the current source and runnable package commands.

The light workbench imagery is captured from the actual editor using its Light appearance. The native Appearance selector offers Light, Dark, and System; Dark remains the app default. The optional landing control examples use the same light workbench tokens. Theme changes repaint waveform canvases without remounting the media player.

Landing action buttons use 32px faces in navigation and 36px faces for the main calls to action, with 6px radii, smaller label type, and tighter padding. Compact navigation retains a 44px hit target around its 32px face; coarse pointers get 44px hit targets around the 36px action faces. The larger hit area is transparent, so it does not add visual weight.

The header is 60px tall on desktop and 56px on phones at the default text size. Reduced vertical padding keeps navigation compact while preserving 44px targets; content can expand the header when text is enlarged.
