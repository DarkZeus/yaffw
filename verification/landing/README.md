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
```

The check uses `verification/browser.cjs`. Provide Playwright through
`YAFFW_PLAYWRIGHT_PATH` if it is installed outside the repository, and set
`YAFFW_BROWSER_EXECUTABLE` when using an existing Chromium executable. Override
`YAFFW_LANDING_ORIGIN` to test another server containing the built landing output;
it defaults to `http://127.0.0.1:4174`.

The progressive-enhancement check covers disabled JavaScript, failed and delayed
module downloads, normal initialization, reduced motion, and an unavailable
IntersectionObserver. It checks readable headings and factual text, a static
Selection/waveform and scene, native editor/source links, default runnable
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

These checks are currently explicit verification commands. Repository-wide Astro
validation and CI integration are tracked separately in issue #149.
