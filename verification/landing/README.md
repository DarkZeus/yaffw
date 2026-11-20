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

These checks are currently explicit verification commands. Repository-wide Astro
validation and CI integration are tracked separately in issue #149.
