# YAFFW landing page

Marketing site and changelog for YAFFW. Static [Astro](https://astro.build) site in the repo's pnpm workspace, deployed as its own Cloudflare Worker (`yaffw-landing`), separate from the editor.

```sh
pnpm install                          # from the repo root
pnpm --filter yaffw-landing dev       # http://localhost:4173
pnpm --filter yaffw-landing build     # → landing/dist
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
- `src/styles/`: one file per section, imported in cascade order by `index.css`. The `--workbench-*` palette comes from the editor's `src/workbench-tokens.css`; `<html class="workbench">` applies it.
- `src/scripts/main.js`: home page behaviour (demo and shortcut timelines, meters, illustrations, repo card)
- `src/scripts/timeline.js`: selection timeline engine shared by the demo and the shortcut playground
- `public/assets/`: app icons and the workbench screenshot
- `DESIGN-NOTES.md`: reference-site research and what was borrowed

## Progressive enhancement

Headings, command text, timeline illustrations, and demo stills are rendered at build time. Demo buttons and command controls become available only after their handlers are attached. Reveal effects enhance newly entering content after initialization and do not hide static content; reduced motion keeps the content static.

Command tabs use automatic activation: Left/Right arrows wrap between Run and Develop, while Home/End select the first/last tab. Tab enters the selected tab once, then moves into its named command panel. Pointer clicks and Enter/Space use the same activation behavior.
