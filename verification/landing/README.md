# Built landing checks

These browser checks exercise the static Astro output, including its behavior
before JavaScript enhancement. Build first, then serve only the generated files:

```sh
pnpm --filter yaffw-landing build
python3 -m http.server 4174 --bind 127.0.0.1 --directory landing/dist
```

This static file server is separate from the user-owned editor development server
at `127.0.0.1:3000`; it does not start either development application.

In another terminal:

```sh
node verification/landing/progressive-check.mjs
node verification/landing/copy-check.mjs
node verification/landing/tabs-check.mjs
node verification/landing/links-check.mjs
node verification/landing/navigation-check.mjs
node verification/landing/contrast-check.mjs
node verification/landing/demo-check.mjs
node verification/landing/disclosure-check.mjs
node verification/landing/images-check.mjs
```

The checks use `verification/browser.cjs`. Use the Chromium installed by the
same Playwright version for repeatable verification; custom executables are
available for diagnostic runs. Provide Playwright through
`YAFFW_PLAYWRIGHT_PATH` if it is installed outside the repository, and set
`YAFFW_BROWSER_EXECUTABLE` when using an existing Chromium executable. Override
`YAFFW_LANDING_ORIGIN` to test another server containing the built landing output;
it defaults to `http://127.0.0.1:4174`.

The Selection example now opens through its own native disclosure before checks inspect its controls. It has no generated video viewer or thumbnail scenery. The progressive-enhancement check covers disabled JavaScript, failed and delayed
module downloads, normal initialization, reduced motion, and an unavailable
IntersectionObserver. It checks readable headings and factual text, a static
Selection/waveform, native editor/source links, default runnable
commands, unavailable controls before handlers attach, and functioning controls
after initialization. It also samples an already visible heading during delayed
initialization to detect content flashing out.

The clipboard check covers successful copying by pointer and Space, denied
clipboard access by Enter, an unavailable Clipboard API, and denied access in a
touch/mobile browser context. It verifies the exact runnable commands, accessible
feedback, and focused text selection for manual copying without a platform-specific
keyboard instruction.

Command tabs use automatic activation: Left/Right changes focus and selection
together and wraps between Run and Develop; Home/End selects the first/last tab.
Only the selected tab is in the Tab order, followed by its named, focusable panel.
The tab check verifies this keyboard behavior, pointer and Enter/Space activation,
Copy visibility, stable ARIA relationships and the browser accessibility tree,
plus useful commands when JavaScript is disabled.

The destination check inspects editor, repository, README and issue links on the
built home, changelog and 404 pages with JavaScript disabled. It also exercises
the hero Enter shortcut, modified Enter, and a native modified editor-link click
that opens a new tab. Requests to the editor destination are intercepted and
fulfilled locally, so the check does not load the production editor.

The section-navigation check covers stale fragments, Back/Forward history,
header/footer links from changelog and 404, disabled JavaScript, inaccessible
session storage, copied destinations opened in a new tab, refresh, skip-link
keyboard continuation, changelog permalinks, targeted links, and reduced motion.
It verifies native URL/focus behavior and waits for the configured header offset
before taking the next navigation step. External modified links are exercised by
the destination check above.

The contrast check uses the existing Canvas and Culori dependencies to measure
browser-rendered foreground/background pixels at 1440px and 390px on home,
changelog, and 404. It wraps rendered text temporarily, samples each visible text
run's horizontal centerline every four CSS pixels, and compares its background
with a solid foreground patch through the same ancestor opacity. It preserves
gradients/translucency and clips samples to overflow containers. It excludes
`aria-hidden` illustrations, raster screenshot contents, and decorative borders;
antialiasing and text shadows are not credited. A white plane behind the scrolled
glass header provides a conservative maximum-brightness backdrop check.

The thresholds follow [WCAG 2.2 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html):
4.5:1 for normal text, 3:1 at 24px or at 18.667px with weight 700+. This is focused
contrast regression coverage, not an accessibility certification or exhaustive
sampling of every animation frame. Browser raster quantization can produce small
differences from analytical color compositing. The current raster artwork is
unchanged; the measurements concern authored page text.

Issue #150 representative results (paired Chromium 145):

| Text / surface                                               |        Before |   After |
| ------------------------------------------------------------ | ------------: | ------: |
| Hero metadata, shortcut note, workflow footnote              |        3.51:1 |  6.44:1 |
| Shortcut-player hint on the workbench surface                |   about 3.5:1 |  6.43:1 |
| Local diagram's code-delivery explanation after dimming      |        2.98:1 |  6.43:1 |
| Scrolled header links over a white backdrop                  |        3.86:1 |  5.37:1 |
| Demo viewer timecode over the initial scene, desktop / phone | 3.81 / 3.19:1 | 18.16:1 |
| Technology-band links (unchanged)                            |        5.35:1 |  5.35:1 |
| Changelog dates and footer secondary text                    |        6.44:1 |  6.44:1 |

The former faint and diagram/header values are analytically composited before
ratios; the former viewer-timecode ratios and after values are raster samples.
Former faint text now uses `--muted-foreground`; the viewer timecode uses a solid
`--workbench-viewer` backing. The final run measured 503 text samples with zero
failures. Results and the single desktop/phone visual-review batch are written to
`tmp/landing-contrast/report.json` and `tmp/landing-contrast/{1440,390}-{hero,local,shortcuts,workflow,demo,changelog}.png`.

The demo check exercises both landing timelines through real pointer gestures,
buttons, keyboard shortcuts and their accessible values/time outputs. It covers
full-range defaults with Loop off, edge and range-body movement, playback outside
Selection, crossing Selection end with Loop off, loop entry/wrapping, paused frame
steps and valid boundary shortcuts that preserve Playhead. Playwright’s clock
advances the simulated 30 FPS timeline deterministically without long playback
waits. This checks the landing simulation; real media decoding/export remains the
editor’s responsibility.

The disclosure check covers the optional keyboard exploration at desktop and
phone widths: native pointer/Enter/Space activation, accessible expanded state,
closed-content Tab exclusion and shortcut inactivity, open demo keyboard use, and
closing during playback without an immediate hidden shortcut interception. It
also verifies that closing discards an unfinished edge gesture and restores its
committed Selection and Playhead on reopening. The check
also opens the native disclosure with JavaScript disabled and verifies useful
static help, preserved workflow/limitations/Source/credits/CTA, and the existing
Shortcuts section destination. Screenshots and page-height readings are written
to `tmp/landing-disclosure/`. Progressive, demo and contrast checks explicitly
open the optional disclosure whenever they inspect its contents; meaningful help
text remains part of the contrast audit.

The disclosure's expanded state is inspected in Chromium's actual accessibility
tree. Playwright 1.58's inferred role snapshot exposes the heading inside a native
summary but omits its `DisclosureTriangle` control; the native tree correctly
reports its name and expanded state without synthetic ARIA attributes.

Issue #157 closed-default reading comparison, using paired Chromium 145,
reduced motion, blocked web fonts, and a 1000px viewport height for both widths:

| Width  | Before height | After height |      Reduction | Visible main words |
| ------ | ------------: | -----------: | -------------: | -----------------: |
| 1440px |        7587px |       6844px |   743px / 9.8% |          676 → 587 |
| 390px  |       10293px |       8719px | 1574px / 15.3% |          656 → 573 |

This is a local reading-length comparison, not a performance benchmark. The
separate Three steps showcase is integrated into the main demo's workflow:
open a file, choose Selection/audio, then review, export and explicitly download.
The optional keyboard summary precedes limitations and Source. Opening it adds
the reference and practice controls without repeating the primary workflow by
default.

All eleven checks listed in `landing/scripts/smoke.mjs` run through `pnpm --filter
yaffw-landing test:smoke` after a production build and are included in root
`pnpm verify` and Linux CI. This includes clipboard, links, demo, disclosure,
images, and contrast, which previously required separate commands. Its Astro
preview uses an OS-assigned loopback port and is stopped on success or failure.
To run a subset against the same isolated preview, pass check names, for example
`pnpm --filter yaffw-landing test:smoke demo disclosure`.
Install the pinned browser with `pnpm exec playwright install chromium`; see
[landing validation](../../landing/README.md#validation) for tooling coverage and
limits.

Issue #154 was also compared with the actual built editor on a separate static
server at port 4175; the user-owned development server at port 3000 was unavailable
and was not started. A 12-second, video-only fixture was made by stream-copy
repeating `public/export-correctness-fixtures/tiny-video-only.mp4`:

```sh
ffmpeg -stream_loop 5 -i public/export-correctness-fixtures/tiny-video-only.mp4 -t 12 -an -c copy /tmp/yaffw-154-editor.mp4
```

Through the editor's file picker, ruler, keyboard shortcuts, loop control, and
range gesture, the comparison confirmed full-file/loop-off defaults, playback
before and after Selection, loop-off playback beyond its end, entry-based wrap,
and a body move from 2.4–3.6 to 3.0–4.2 seconds preserving duration and Playhead.
Crossed boundary commands preserved Playhead and a minimum source frame (40ms for
this 25-FPS fixture), and a frame step paused playback. The landing keeps the
same interaction rules while deliberately simulating a fixed nominal-30-FPS
asset; its seconds-based state is not the editor's media-time domain model.

The mobile-navigation check covers home, changelog and 404 at 320px, 390px,
768px and 1440px, with JavaScript enabled and disabled. It verifies directly
available brand/editor destinations, Changelog inside the mobile menu, active-page
indication, native Menu disclosure/expanded state, touch target dimensions on
compact layouts, pairwise control overlap, and horizontal overflow. At default text size, the
compact header must stay within 60px in one row, with the visible wordmark left
and adjacent editor/menu controls right in both visual and keyboard order; this
prevents the oversized two-row header regression. This check also runs in the default smoke suite. Every
no-JavaScript case also runs at 200% root text size. It activates section links
and checks target focus and visibility without manually closing the unenhanced menu. Enhanced cases cover
keyboard entry/Escape, outside focus/pointer dismissal without focus stealing,
modified-link new-tab behavior, and keyboard continuation after section navigation.

```sh
node verification/landing/mobile-navigation-check.mjs
```

Representative header/menu screenshots are written to
`tmp/landing-mobile-navigation/`. These checks use paired Chromium, reduced motion
and blocked external fonts for repeatability. The text-enlargement case changes
root font size; it does not claim to reproduce every browser/OS zoom setting.
The geometry checks concern authored navigation controls, not unrelated raster
screenshot contents or a full accessibility certification.

The image check exercises the built page at 390px (1× and 2×), 768px and 1440px.
It checks AVIF/WebP/JPEG markup, actual selected responses and payloads, the current
1600×900 capture's undistorted hero geometry, eager/high priority, lazy Selection
and feature media, matching-resource reuse, the intentional Selection crop, and
sharing-asset availability. A delayed-image case checks layout stability. Reports
and hero/Selection captures are written to `tmp/landing-images/`.

```sh
node verification/landing/images-check.mjs
```

The 21 November 2026 redesign’s light-workbench update, in local Chromium 158, selected:

| Viewport | Density | AVIF width | Encoded image body |
| -------- | ------: | ---------: | -----------------: |
| 390px    |      1× |      480px |       19,331 bytes |
| 390px    |      2× |      800px |       45,713 bytes |
| 768px    |      1× |      800px |       45,713 bytes |
| 1440px   |      1× |     1200px |       91,905 bytes |

The hero and Selection detail share transformed URLs. The phone detail deliberately
uses a wider image than the visible crop to keep timeline text readable. The CTA
has no backdrop. These are local resource-selection and visual checks, not
real-device load-time or Core Web Vitals measurements. JPEG and WebP remain
fallbacks; browser checks run in Chromium.

Issue #149 validates the gates themselves with a temporary Astro probe: both a
frontmatter assignment mismatch and a component-prop mismatch fail type checking;
a missing image alt fails Astro a11y lint; an unformatted template fails the
formatter. The probe is removed after checking. Corrupting a built Features link
also fails the smoke suite's actual URL/focus contract, and the failed run closes
its assigned preview port.

Navigation runtime-error assertions apply to JavaScript-capable contexts,
including unavailable storage. Chromium 158 emits stackless native CSS view-
transition abort diagnostics during some cross-document navigations even with
all page JavaScript disabled (reproduced in both matching headless distributions).
The no-JavaScript case checks actual URL, focus and header clearance;
it does not count those browser animation diagnostics as application-script
errors. No application exception filter or product CSS workaround is installed.

The metadata check verifies home/changelog canonical and social identity against
the confirmed deployment setting or explicit `LANDING_SITE_ORIGIN` override,
including query/fragment-independent home identity,
page-specific titles/descriptions, absolute sharing image URLs, JPEG MIME type,
actual 1200×630 decoded crop dimensions and descriptive alt text. It resolves the
image path against the local built server to validate pre-deployment assets,
rather than claiming an unpushed image is already hosted at the production URL.
The 404 file and an arbitrary missing path must omit canonical/OG/Twitter identity
and remain noindex. With an explicit empty origin override, the home/changelog previews must
also omit identity and be noindex. Theme metadata remains OKLCH.

```sh
pnpm --filter yaffw-landing test:metadata
```

Keep the origin environment identical to the build being checked. The metadata
check is part of the existing smoke preview and adds no extra build. The sharing
crop is saved to `tmp/landing-metadata/social-preview.jpg` for visual inspection
when production identity is configured. #161's production-mode fixture uses a
reserved test hostname and a temporary build directory; the real production
origin is owned by `landing/config/deployment.json`, as confirmed by the user,
and is never inferred from that fixture.
The image check now verifies sharing-asset availability only for configured
content builds and verifies omission for non-indexable unconfigured previews.

The metadata-only command reuses Astro's temporary preview and its 404 fallback.
The generic Python file server above does not serve the site's 404 template for
arbitrary missing paths. For an already running Astro preview/Worker, pass its
origin via `YAFFW_LANDING_ORIGIN` to `node verification/landing/metadata-check.mjs`.
