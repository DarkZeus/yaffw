# YAFFW landing page

Marketing site and changelog for YAFFW. Static [Astro](https://astro.build) site in the repo's pnpm workspace, deployed as its own Cloudflare Worker (`yaffw-landing`), separate from the editor.

```sh
pnpm install --frozen-lockfile        # from the repo root
pnpm --filter yaffw-landing dev       # http://localhost:4173
pnpm --filter yaffw-landing build     # → landing/dist
pnpm --filter yaffw-landing preview   # preview the built site on port 4173
```

## Deploy

```sh
pnpm --filter yaffw-landing build
cd landing && npx wrangler deploy
```

With Cloudflare Workers Builds, connect the repo a second time with root directory `landing`, build command `pnpm --filter yaffw-landing build`, and build watch paths `landing/**` and `src/workbench-tokens.css`.

## Changelog

Write one Markdown file per notable feature or change in `src/content/changelog/`, then deploy. Copy `_template.md`:

```md
---
title: Export presets
date: 2026-11-20
version: 1.2.0 # optional
---

What changed, for someone who uses the editor.
```

Entries are sorted by `date`. The file name becomes the entry's link (`/changelog/#file-name`). Files starting with `_` are skipped, so prefix a draft with `_` until it's ready.

## Layout

- `src/pages/index.astro`: home page
- `src/pages/changelog.astro`: the hand-written entries in `src/content/changelog/`, newest first
- `src/layouts/Base.astro`: head, nav, footer
- `src/links.js`: editor and repository destinations shared by pages, layout, and client shortcuts
- `src/styles/`: one file per section, imported in cascade order by `index.css`. The shared `--workbench-*` palette is owned by `src/workbench-tokens.css` at the repository root and imported by both editor and landing; `<html class="workbench">` applies it.
- `src/scripts/main.js`: home page behaviour (demo and shortcut timelines, meters, illustrations, repo card)
- `src/scripts/timeline.js`: selection timeline engine shared by the demo and the shortcut playground
- `public/assets/`: app icons
- `src/assets/workbench.jpg`: original real workbench screenshot
- `src/components/WorkbenchScreenshot.astro`: shared responsive image transforms for the eager hero and lazy decorative CTA backdrop
- `DESIGN-NOTES.md`: current visual behavior, demo limitations, historical reference research, and documentation ownership. Later design/demo changes must update affected notes in the same issue.

## Progressive enhancement

Headings, command text, timeline illustrations, and demo stills are rendered at build time. Demo buttons and command controls become available only after their handlers are attached. Reveal effects enhance newly entering content after initialization and do not hide static content; reduced motion keeps the content static.

Command tabs use automatic activation: Left/Right arrows wrap between Run and Develop, while Home/End select the first/last tab. Tab enters the selected tab once, then moves into its named command panel. Pointer clicks and Enter/Space use the same activation behavior.

Section links use native URL fragments and browser history. Focusable section targets preserve keyboard continuation with or without JavaScript; the fixed-header offset is provided by CSS scroll padding. Navigation does not require session storage.

Both demo timelines start with the full simulated file selected and looping off. Playback and Selection are independent; range-body dragging preserves duration and Playhead, edge dragging previews a boundary until release, and canceled drags discard the draft. Frame steps pause playback, and boundary shortcuts keep a valid range without moving Playhead. The simulation uses a fixed 93.525-second, nominal-30-FPS asset in seconds; it does not decode or export media.

The main demo owns the compact editing workflow and full-file Selection note. Keyboard reference and its playground sit behind the native Try keyboard controls disclosure at `#shortcuts`; collapsed content cannot receive focus or handle shortcuts, and closing it stops playback. The native disclosure still opens static help without JavaScript.

Below 960px the header keeps Changelog visible alongside a native Sections disclosure, the home link, and Open editor. The section destinations come from the same list as desktop navigation. Native disclosure and links work without JavaScript; enhancement adds Escape dismissal with focus returned to the summary, outside-pointer/focus dismissal without stealing focus, and closure after unmodified link activation. Modified link activation stays native. Before enhancement, the compact header and open menu stay in document flow so they cannot cover a fragment destination. Enhancement keeps the header sticky and places the dismissible menu below it. Compact header controls have at least 44px targets; the phone home link uses the product icon with its accessible name, and repository access remains in Source. Rem-based header type and a conservative CSS fragment offset accommodate enlarged text without relying on script measurements.

## Workbench imagery

The original screenshot is imported through [Astro’s image pipeline](https://docs.astro.build/en/guides/images/), rather than served unchanged from `public/`. The shared screenshot component generates AVIF/WebP with JPEG fallback at 480, 800, 1200, 1800, 2400 and 2940 pixels, quality 80. The hero sizes match its CSS slot (900px on desktop and the inner page width below 960px); priority keeps it eager/high-priority. The lower decorative backdrop stays lazy and uses the viewport width. Both uses share transforms and URLs, so matching selected resources can be reused from browser cache. Imported dimensions preserve the original 2940:1838 aspect ratio; descriptive hero alt text and the decorative empty alt are retained. Updating the source screenshot requires no hand-maintained derivative files.
