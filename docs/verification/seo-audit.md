# SEO audit — 21 November 2026

Scope: the production landing, changelog and editor, their build output, and Cloudflare static-asset routing. Baseline is commit `fdd2667`. Repairs described here are local working-tree changes; they have not been deployed as part of this audit.

## Findings and repairs

| Priority | Finding before the change | Repair and evidence |
| --- | --- | --- |
| High | Arbitrary editor URLs returned HTTP 200 with the editor HTML, including `/sitemap.xml`, `/changelog/`, and a made-up address. The old editor URL redirected only after JavaScript ran. | Cloudflare now uses `404-page` handling with a useful noindex error document. Explicit 301 rules preserve `/editor-next`, `/editor-next/`, and `/index.html`. Checked in Wrangler's actual local asset runtime, including missing JS assets. The application root remains indexable. |
| Medium | Landing `/sitemap.xml` returned 404. Its robots response contained Cloudflare-managed comments, with no application-owned discovery rules. The editor's robots file had no sitemap. | Each origin now has a valid XML sitemap advertised through robots. Landing entries are exactly `/` and `/changelog/`; editor contains only its root. Canonical paths, JSON-LD and landing discovery share the configured production origin. No fabricated modification dates or fragment URLs. |
| Medium | Landing had no machine-readable site/application identity. | Server-rendered JSON-LD: `WebSite` and `WebApplication` on home; `WebPage` on canonical content pages. Actual editor URL, source repository, brand image, browser requirements and free access. No speculative features or ratings. Errors/previews omit structured identity. |
| Medium | Editor HTML had only the title “YAFFW”, a short generic description, no canonical or social metadata, and an empty no-JS body. | Descriptive editor title and summary, self-canonical root, Open Graph/Twitter metadata, verified 512×512 icon, and useful no-JS requirements/help linked to the landing. Landing and editor have distinct page identities. |
| Medium | Mobile Lighthouse identified the Google Fonts stylesheet as a render blocker, with approximately 830 ms estimated savings. | Self-host the same Inter and Geist Mono families from pinned Fontsource packages. Preserve Inter's optical-size/weight axes, preload the main Latin font, retain swap/system fallback and Unicode subsets. Publish upstream OFL licenses. No third-party font request is needed. |
| Medium | The 192px PNG logo transferred about 30 KB for 20–24px uses. Screenshot candidates exceeded some mobile slot requirements. | Astro-generated 1×/2×/3× WebP logo variants; eager nav logo and lazy lower-page logos. Add 640px/1400px screenshot candidates while preserving intrinsic size, crop, priority, and high-density quality. |
| Low | Cloudflare required browser revalidation for every hashed asset. | Immutable one-year browser caching only for generated `/_astro/` and `/assets/` resources. HTML retains the platform's revalidation behavior. Bundled editor media fixtures have `X-Robots-Tag: noindex`. |
| Low | Existing metadata checks did not cover discovery files, graph consistency, or all internal fragments. | Add landing/editor SEO browser groups to ordinary verification. Check XML, MIME types, canonical/graph identity, links/fragments, social image availability, actual font loading without JS, noindex errors, and preview behavior. Explicit edge mode checks Cloudflare 301/404/cache/header contracts. |

Discovery files are useful for reliability and monitoring; a small, linked site can be indexed without a sitemap. Missing JSON-LD also does not by itself prevent indexing. These are enhancements, separate from the editor's incorrect success responses for missing pages.

## Existing strengths retained

- Landing content, navigation, headings and changelog render as static HTML. Search discovery does not depend on the interactive examples.
- One descriptive H1 per page; home and changelog have distinct titles, descriptions and canonicals. Tracking parameters/fragments do not change page identity.
- Open Graph and large-image Twitter previews initially used a cropped workbench image. The user requested a designed card instead; sharing now uses a 1200×630 PNG rendered by Takumi from an HTML/CSS template with local Inter and the YAFFW mark. Dimensions, PNG MIME type and descriptive alt remain verified. The application schema labels it as `image`, not `screenshot`.
- Preview/noindex behavior was already explicit and remains intact. Robots permits crawling so crawlers can read the noindex instruction; it does not hide the page from the crawler.
- Arbitrary missing landing URLs already returned a real 404 with noindex. Direct access to the error document can return 200 as a static asset, but is still noindex and is never listed in discovery.
- Semantic links, skip navigation, descriptive content-image alternatives, responsive layout, intrinsic image dimensions, lazy secondary imagery, and an eager/high-priority hero were already present.
- Copy explains the actual single-video workflow and its limits. Codec support, best-effort export boundaries, local processing and memory limitations remain explicit. No claims about guaranteed lossless/frame-exact exports or universal browser support were added.

## Search intent and content

The homepage already answers the principal intent: editing a local video in a browser without uploading it. Its Selection workflow, audio section, output settings, browser requirements, privacy explanation and source code cover related questions with actual product evidence. Free access is now stated visibly as well as in structured data.

No keyword-density target, meta-keywords tag, hidden SEO text, FAQ padding, programmatic format pages or fabricated testimonials were added. There is no evidence from query/impression data that another page is currently needed. If Search Console later shows demand for a specific task (for example choosing an MP4 range or adjusting embedded audio), a genuinely useful, tested guide would be a better next content step than near-duplicate “converter” pages.

There is only English content, so no alternate-language/hreflang declarations are warranted. There is no on-site search to describe with `SearchAction`, and no published rating/review data. `WebApplication` describes the product semantically; **Google software-app rich-result eligibility is not claimed** because its review/rating requirements are not met. Schema syntax/property consistency checks are not a substitute for Google's hosted Rich Results Test.

## Live HTTP baseline

Read-only probes covered 18 URLs across both confirmed Workers origins: root, robots, sitemap, slash/no-slash changelog, index alias, error document, arbitrary missing path and old editor route. Browser/curl requests reached both roots with 200. Googlebot/bingbot user-agent probes also returned 200; changing a user-agent is not proof of access from a verified search crawler.

Python's default HTTP user-agent received Cloudflare 403/1010 responses, while ordinary Chromium and curl succeeded. That client-specific response was not treated as a site-wide outage. Search Console URL Inspection remains the authoritative follow-up for Google's fetch and selected canonical.

Both HTTP and HTTPS currently serve 200 on the public Workers hosts. All canonicals, social identities, sitemaps and authored production links select HTTPS. No alternate/custom domain was invented or configured. Path-based static `_redirects` rules cannot distinguish request schemes; no HTTP-to-HTTPS redirect is claimed. Enforcing that first-request redirect would require a hosting policy or a Worker request handler, rather than another metadata tag. A request handler was not added solely for this because it would put every static request through application code. Check the available HTTPS policy when configuring a future custom domain.

## Lab performance

Lighthouse 13.6.0, Playwright Chromium 158.0.8127.18, default simulated mobile settings. The live baseline scored **94 performance / 100 accessibility / 100 best practices / 100 SEO**, with FCP 1.95 s, LCP 2.89 s, CLS 0 and TBT 0 ms. The SEO score was already 100 despite the missing sitemap and editor routing problems; it is not a comprehensive SEO verdict.

Local before/after measurements use the baseline and revised builds on isolated Astro previews on this machine. Local-origin numbers are lab evidence, not deployed performance or field Core Web Vitals. Raw Lighthouse reports are stored in `/tmp/yaffw-seo-audit/`; measurements and limitations should accompany any performance claim.

| Local mobile run | Performance | FCP | LCP | CLS | TBT |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline, default Lighthouse simulation | 99 | 1.47 s | 1.65 s | 0 | 0 ms |
| Revised, default Lighthouse simulation | 97 | 0.90 s | 2.63 s | 0 | 0 ms |
| Baseline, actual DevTools throttling | 99 | 1.57 s | 1.68 s | 0 | 4 ms |
| Revised, actual DevTools throttling | 99 | 1.66 s | 1.66 s | 0 | 16 ms |

Accessibility, best-practices and SEO scores were 100 in all four runs. Removing/lowering the font preload in disposable output did not improve the simulated result, so those experiments were not promoted. The divergent simulation/actual-throttle observations do **not** support claiming a universal speed improvement or a deployed Core Web Vitals pass. The deterministic improvements are fewer external font dependencies and smaller image transfers: in the audited 1.75× mobile viewport the hero candidate drops from 800px (~45 KB) to 640px (~32 KB), the Selection detail from 1600px (~140 KB) to 1400px (~119 KB), and the small logo from ~30 KB to under 1 KB. Re-measure deployed behavior after release; do not compare the live baseline directly with local scores as if the origins were equivalent.

Separate Lighthouse SEO-category runs on the revised changelog and editor root both scored 100. These complement the explicit discovery/status/schema checks; they do not establish indexing or rankings.

## Verification and reproduction

Ordinary repository gates:

```sh
pnpm verify
pnpm --filter yaffw-landing test:seo
pnpm test:editor seo
```

The SEO groups are included in full verification: landing has 12 browser groups; editor has seven. The existing 385 unit tests and all prior media/appearance checks remain required.

Observed results: all 385 unit tests passed; editor build/type checking passed; root lint and formatting of SEO-owned files passed; the complete landing verification passed (12 groups, including 486 contrast samples with zero failures); all seven editor browser groups passed. Production and unconfigured-preview metadata/SEO checks, and both explicit Wrangler edge checks, passed. One early unit run hit an asynchronous preview-test timeout during concurrent performance work; a subsequent run passed without changing that test or its timeout.

Separate `marketing/launch-video/` files initially blocked repository formatting during the audit. Those unrelated files were left untouched by this work and their formatting was subsequently corrected independently. **The final full `pnpm verify` passed before commit**, including all 385 unit tests, both builds, all 12 landing browser groups and all seven editor groups. No checks were bypassed. The launch-video work is excluded from the SEO/social-card commit.

For intentionally unconfigured preview output, build to a temporary directory and preview that output with the same empty origin override:

```sh
LANDING_SITE_ORIGIN="" pnpm --filter yaffw-landing exec astro build --outDir /tmp/yaffw-seo-preview
LANDING_SITE_ORIGIN="" pnpm --filter yaffw-landing exec astro preview --outDir /tmp/yaffw-seo-preview --host 127.0.0.1 --port 4188
```

In a second terminal:

```sh
LANDING_SITE_ORIGIN="" YAFFW_LANDING_ORIGIN=http://127.0.0.1:4188 node verification/landing/metadata-check.mjs
LANDING_SITE_ORIGIN="" YAFFW_LANDING_ORIGIN=http://127.0.0.1:4188 node verification/landing/seo-check.mjs
```

Preview assertions passed: no canonical/social/JSON-LD identity, no sitemap locations or robots advertisement, noindex HTML, working internal links/fonts, and a real missing-page 404. Production output remains separate.

Cloudflare contracts require its runtime rather than Vite/Astro preview. After building both applications, start each command in a separate terminal:

```sh
pnpm dlx wrangler@4.166.0 dev --local --config landing/wrangler.jsonc --port 62841 --inspector-port 62843
pnpm dlx wrangler@4.166.0 dev --local --config wrangler.jsonc --port 62842 --inspector-port 62844
```

Then run:

```sh
YAFFW_SEO_EDGE=1 YAFFW_LANDING_ORIGIN=http://127.0.0.1:62841 node verification/landing/seo-check.mjs
YAFFW_SEO_EDGE=1 YAFFW_EDITOR_ORIGIN=http://127.0.0.1:62842 node verification/editor-seo-check.mjs
```

Both edge checks passed: permanent canonical redirects, actual 404 statuses, discovery/metadata, immutable hashed assets and noindex media fixtures. These edge checks are explicit commands; ordinary browser preview checks do not claim to establish CDN behavior.

The mobile navigation check now awaits native cross-document fragment focus before asserting it. Instrumented runs showed URL/load completion preceding focus settling. Its polling runs from Node because page animation-frame callbacks do not run with JavaScript disabled. All target-focus, menu, geometry and keyboard-continuation assertions are retained. No application navigation workaround was added.

## Remaining external verification

1. **Deploy both builds**, then repeat edge checks against the public origins. These source repairs do not alter the live site until deployed; the separate Cloudflare build connections must both finish successfully.
2. **Verify both properties in Google Search Console**, submit their `/sitemap.xml` URLs, and inspect root/changelog/editor URLs. Check Google-selected canonical, rendered content, robots accessibility and indexing coverage. No Search Console connection or ownership token was available during this audit; no verification status or indexed-page count is claimed. Do the corresponding sitemap submission in Bing Webmaster Tools if that account is used.
3. **Measure actual traffic and field experience** after recrawling. Impressions, queries, CTR, backlinks and field LCP/INP/CLS were not available. Lighthouse TBT is not field INP, and a good lab score does not establish ranking or Core Web Vitals success.

When introducing another editor route, add its direct-navigation hosting behavior alongside the client route. Removing the catch-all success fallback is safe for the current root plus legacy alias; an undeclared future deep link should not silently become an editor success page.

## Primary references

- [Google: build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) — canonical URLs and genuine modification dates.
- [Google: canonicalization](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) — consistent identity and permanent redirects.
- [Google: robots guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro) — crawl control versus noindex.
- [Google: site names](https://developers.google.com/search/docs/appearance/site-names), [Schema.org: WebApplication](https://schema.org/WebApplication), [Google: software-app requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app) — factual identity versus rich-result eligibility.
- [Cloudflare: asset routing](https://developers.cloudflare.com/workers/static-assets/), [redirects](https://developers.cloudflare.com/workers/static-assets/redirects/), [headers](https://developers.cloudflare.com/workers/static-assets/headers/) — edge behavior used by the fixes.
- [Fontsource: variable fonts](https://fontsource.org/docs/getting-started/variable) — self-hosted font loading.
- [Google: Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start), [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals), [Chrome: Lighthouse](https://developer.chrome.com/docs/lighthouse/overview) — follow-up measurement and limits.
