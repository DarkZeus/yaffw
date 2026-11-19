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

## Layout

- `src/pages/index.astro`: home page
- `src/pages/changelog.astro`: GitHub releases of DarkZeus/yaffw, fetched at build time (`src/releases.ts`). Publish a release, then rebuild. `GITHUB_TOKEN` is optional and lifts the API rate limit; a production build fails if the request fails, so a broken fetch never ships an empty changelog.
- `src/layouts/Base.astro`: head, nav, footer
- `src/styles/`: one file per section, imported in cascade order by `index.css`. The `--workbench-*` palette comes from the editor's `src/workbench-tokens.css`; `<html class="workbench">` applies it.
- `src/scripts/main.js`: home page behaviour (demo and shortcut timelines, meters, illustrations, repo card)
- `src/scripts/timeline.js`: selection timeline engine shared by the demo and the shortcut playground
- `public/assets/`: app icons and the workbench screenshot
- `DESIGN-NOTES.md`: reference-site research and what was borrowed
