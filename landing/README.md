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
pnpm --filter yaffw-landing build:production
cd landing && npx wrangler deploy
```

The confirmed HTTPS production **landing** origin is a public deployment setting in `config/deployment.json`. The production command validates it before building. `LANDING_SITE_ORIGIN` can explicitly override it in the build environment; an empty override selects a non-indexable preview and is rejected by the production command.

### Automatic deployment

Connect the existing `yaffw-landing` Worker to `DarkZeus/yaffw` through **Settings → Builds → Connect** with these settings:

| Setting                   | Value                                 |
| ------------------------- | ------------------------------------- |
| Production branch         | `master`                              |
| Root directory            | `landing`                             |
| Build command             | `pnpm check && pnpm build:production` |
| Deploy command            | `npx wrangler deploy`                 |
| Preview builds            | Disabled                              |
| Build watch include paths | `*`                                   |
| Build cache               | Enabled                               |

Each push to `master` runs the landing's formatting, template lint/accessibility, and Astro type checks, builds the production assets, and deploys only if those commands succeed. Watching all paths also covers shared tokens and workspace dependency changes. `landing/.node-version` selects Node.js 24, and the root `packageManager` selects pnpm 10.33.0.

The editor is a separate Worker (`yaffw`) with its own Git build connection. GitHub's **Verify** workflow checks both applications independently of the Cloudflare deployment; its result is not a deployment prerequisite. Check **Workers Builds: yaffw-landing** on the pushed commit and the Worker's active deployment to confirm that a landing update reached production.

The commands above remain available for a manual deployment. `npx wrangler deploy` alone uploads the existing `landing/dist`; it does not rebuild Astro, so run the production build first.

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
- `src/scripts/main.js`: home page behaviour (optional Selection and shortcut timelines, repo commands)
- `src/scripts/timeline.js`: selection timeline engine shared by the demo and the shortcut playground
- `public/assets/`: app icons
- `src/assets/workbench-current.jpg`: current real editor capture; Audio and Export panel captures sit beside it. The social card is authored separately.
- `src/components/WorkbenchScreenshot.astro`: shared responsive image transforms for the eager hero and lazy Selection detail
- `src/social/card.html`: the social card’s HTML/CSS design
- `src/pages/og.png.ts`: Takumi build-time rendering of `/og.png`, using local Inter and the brand icon
- `src/site.ts`: indexable content paths shared by canonical metadata typing and the sitemap
- `src/pages/robots.txt.ts`, `src/pages/sitemap.xml.ts`: build-time discovery files using the same production identity as page metadata
- `public/_redirects`, `public/_headers`: permanent canonical redirects and immutable caching for hashed Astro assets
- `DESIGN-NOTES.md`: current visual behavior, demo limitations, historical reference research, and documentation ownership. Later design/demo changes must update affected notes in the same issue.

## Progressive enhancement

Headings, command text, timeline illustrations, and demo stills are rendered at build time. Demo buttons and command controls become available only after their handlers are attached. Reveal effects enhance newly entering content after initialization and do not hide static content; reduced motion keeps the content static.

Command tabs use automatic activation: Left/Right arrows wrap between Run and Develop, while Home/End select the first/last tab. Tab enters the selected tab once, then moves into its named command panel. Pointer clicks and Enter/Space use the same activation behavior.

Section links use native URL fragments and browser history. Focusable section targets preserve keyboard continuation with or without JavaScript; the fixed-header offset is provided by CSS scroll padding. Navigation does not require session storage.

The Selection example is optional inside Explore Selection controls and explicitly describes its simulated nature. Both demo timelines start with the full simulated file selected and looping off. Playback and Selection are independent; range-body dragging preserves duration and Playhead, edge dragging previews a boundary until release, and canceled drags discard the draft. Frame steps pause playback, and boundary shortcuts keep a valid range without moving Playhead. The simulation uses a fixed 93.525-second, nominal-30-FPS asset in seconds; it does not decode or export media.

The main demo owns the compact editing workflow and full-file Selection note. Keyboard reference and its playground sit behind the native Try keyboard controls disclosure at `#shortcuts`; collapsed content cannot receive focus or handle shortcuts, and closing it stops playback. The native disclosure still opens static help without JavaScript.

Below 1080px the header places Changelog and section links inside a native Menu disclosure alongside the home link and Open editor. The section destinations come from the same list as desktop navigation. Native disclosure and links work without JavaScript; enhancement adds Escape dismissal with focus returned to the summary, outside-pointer/focus dismissal without stealing focus, and closure after unmodified link activation. Modified link activation stays native. Before enhancement, the compact header and open menu stay in document flow so they cannot cover a fragment destination. Enhancement keeps the header sticky and places the dismissible menu below it. Compact header controls have at least 44px targets; the phone home link uses the product icon with its accessible name, and repository access remains in Source. Rem-based header type and a conservative CSS fragment offset accommodate enlarged text without relying on script measurements.

## Workbench imagery

The landing shows a complete capture of the current editor, a clipped Selection detail, and real Audio and Export panel captures. The image components use Astro's image pipeline with AVIF/WebP and JPEG fallback. The hero has 480, 640, 800, 1200, 1400 and 1600px candidates, explicit slot sizes, intrinsic 1600×900 dimensions, and eager/high-priority loading. The Selection detail shares those transformed URLs and loads lazily. Feature panel images also load lazily. Small brand icons use appropriately sized WebP variants. The CTA has no decorative backdrop.

Inter (including optical size and weight axes) and Geist Mono are self-hosted through pinned Fontsource packages. CSS uses `font-display: swap`; the main Latin Inter font is preloaded. Only character subsets needed by the page are downloaded. Google Fonts is no longer a rendering dependency. The upstream OFL licenses are published under `/fonts/`.

The product imagery is deliberately separate from the landing tokens. The 1200×630 social card uses Inter, a neutral canvas, the YAFFW mark and a direct product headline. Takumi renders the HTML/CSS template with native OKLCH colors; it uses no screenshot or browser capture. No reference-site imagery or branding is copied. See [DESIGN-RESEARCH.md](DESIGN-RESEARCH.md) for design provenance.

## Validation

Use the repository-supported Node versions (24.16+ in the 24.x line, or 26.3+) and pinned pnpm. From the root:

```sh
pnpm exec playwright install chromium   # once per installed Playwright version
pnpm --filter yaffw-landing check       # Astro formatting, template lint/a11y, types
pnpm --filter yaffw-landing verify      # check, production build once, browser smoke
pnpm verify                            # portable gates and real editor browser checks
```

On Linux, `pnpm exec playwright install --with-deps chromium` also installs the browser's system dependencies; CI uses this form. The browser must match the pinned Playwright version. `pnpm --filter yaffw-landing format` formats Astro templates; root `pnpm format` retains Oxfmt ownership of the other maintained files.

- **Types:** `astro check --minimumFailingSeverity warning` validates Astro frontmatter, templates/component props, and included TypeScript through `@astrojs/check` and the landing's strict Astro tsconfig. Its supported TypeScript 6 dependency is local to this package; editor checking remains on TypeScript 7. `astro build` compiles and optimizes assets and is a separate step, not a type check. Imported JavaScript is allowed for inference but `checkJs` is not enabled; ordinary `.js` is not claimed as type checked.
- **Markup:** the official Prettier Astro plugin formats `src/**/*.astro`. ESLint's Astro recommended and Astro-adapted JSX a11y recommended rules check those templates, including embedded expressions. Existing Oxfmt/Oxlint still check maintained JS/CSS/configuration at the root. Template lint cannot inspect HTML strings generated by `timelineHTML`, check content emitted by Markdown components, prove contrast, or validate runtime focus/expanded state. Browser contracts and focused visual audits cover those surfaces; this is not a full accessibility certification.
- **Browser:** the smoke runner previews the existing production build on an OS-assigned loopback port and stops its preview on success or failure. Its 12 groups cover navigation, mobile-navigation, command tabs, progressive initialization, metadata, SEO, clipboard, destinations, demo gestures/playback, native disclosures, responsive images/layout stability, and rendered contrast. It never starts the development server or uses port 3000. Checks include no-JS and unavailable storage, disabled/failed/delayed modules, reduced motion, missing observer support, compact header geometry, touch targets, menu dismissal, and 200% text enlargement. They assert observable contracts rather than private timeline state.

Root verification and the Linux CI job use the same landing command, with one landing build. The separate macOS job checks actual editor media workflows. All landing checks also remain individually runnable through the smoke runner; see [verification/landing/README.md](../verification/landing/README.md).

## Canonical origin and sharing

[`config/deployment.json`](config/deployment.json) owns the confirmed public landing origin: [yaffw-landing.serhii-resnyanskyi.workers.dev](https://yaffw-landing.serhii-resnyanskyi.workers.dev/). This is separate from the editor destination and was confirmed for #161. Update this deployment setting when the canonical landing domain changes. The request host and preview URL never supply a fallback.

`LANDING_SITE_ORIGIN` is an optional explicit build override, including [Workers Builds build variables](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/). Unset uses the versioned deployment setting; an explicit empty value selects a non-indexable preview. The resolved origin must be HTTPS without credentials, path, query or fragment. Localhost, loopback and unspecified addresses (including IPv4-mapped IPv6 forms) are rejected. Changing runtime variables after a static build cannot rewrite its metadata.

Home declares `/` and changelog `/changelog/`; their absolute canonical and social URLs use the resolved production origin even when the files are previewed elsewhere. Query strings and fragments do not change page identity. Titles/descriptions remain page-specific. Sharing uses `/og.png`, a 1200×630 PNG rendered from `src/social/card.html` by Takumi during the Astro build. The renderer loads the existing Inter font and brand icon locally; generation makes no network requests and adds no runtime Worker processing. Image dimensions, MIME type and descriptive alt accompany Open Graph and large-image Twitter metadata. No social handle or additional attribution claim is invented.

A preview built with the configured production origin points canonicals to production. To build an intentionally non-indexable preview with no canonical or social identity:

```sh
LANDING_SITE_ORIGIN="" pnpm --filter yaffw-landing build
LANDING_SITE_ORIGIN="" pnpm --filter yaffw-landing test:metadata
```

That preview emits `noindex,follow`. `build:production` rejects an empty override or invalid resolved origin. The 404 template always omits canonical/social identity and remains noindex, both at `/404.html` and arbitrary missing addresses. Existing theme metadata stays OKLCH.

Production builds also emit an XML sitemap containing only home and changelog, and advertise its absolute URL in `robots.txt`. Fragments, errors and the separate editor are excluded from that sitemap. No build-time `lastmod`, arbitrary priority, or change frequency is invented. Unconfigured preview builds emit an unadvertised sitemap with no URLs; robots permits crawling so the HTML `noindex` remains readable.

JSON-LD describes each canonical `WebPage`. The homepage owns the `WebSite` name and a factual `WebApplication` entity linking the real editor, browser requirements, free access, source repository and brand image. Errors and unconfigured previews omit JSON-LD. There are no invented reviews, ratings, search actions, or rich-result eligibility claims. Production pages allow large search image previews.

`pnpm --filter yaffw-landing test:seo` checks metadata and SEO in the existing build: discovery files, matching canonical/schema identity, all emitted internal links and fragments, a genuine missing-page 404, and font availability without JavaScript. Astro preview does not implement Cloudflare `_redirects` or `_headers`. Set `YAFFW_SEO_EDGE=1` when running `verification/landing/seo-check.mjs` against a local Wrangler runtime or a deployed Worker to additionally verify permanent redirects and immutable asset headers. See the [SEO audit](../docs/verification/seo-audit.md) for evidence, edge commands and remaining account-level checks.

The normal smoke runner includes the metadata check and adds no extra build. Keep any origin override identical to the build being checked. Production-mode fixtures use an explicit reserved test hostname in a temporary output directory, never the publishable landing output; ordinary production builds use the confirmed deployment setting.

Use `pnpm --filter yaffw-landing test:metadata` to inspect only metadata in an existing build. It starts the same short-lived Astro preview, including its 404 fallback; a generic file server does not reproduce Worker missing-page routing. To check an already running Astro preview or Worker, set `YAFFW_LANDING_ORIGIN` and run `node verification/landing/metadata-check.mjs` directly.

The light workbench imagery is captured from the actual editor using its Light appearance. The native Appearance selector offers Light, Dark, and System; Dark remains the app default. The optional landing control examples use the same light workbench tokens. Theme changes repaint waveform canvases without remounting the media player.
