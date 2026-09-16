## Agent skills

### Issue tracker

GitHub Issues in `DarkZeus/yaffw` is the default issue tracker. Use the GitHub connector when available, otherwise use `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the repository's canonical triage-label vocabulary, including `ready-for-agent` for AFK-ready work. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. Read root `CONTEXT.md` and relevant records under `docs/adr/` before making domain or architecture changes. See `docs/agents/domain.md`.

### Colors

Use `oklch()` for all authored color values throughout this repository: production UI, prototypes, verification pages, CSS tokens, inline styles, gradients, shadows, SVG colors, and HTML/manifest metadata. Do not introduce hex, RGB, HSL, or named-color literals. Use `color-mix(in oklch, …)` when mixing colors. Give achromatic colors a `none` hue so mixing with neutrals preserves the chromatic color’s hue. Reuse semantic color tokens where available; Tailwind color utilities must resolve to OKLCH tokens (including black and white). `transparent`, `currentColor`, and inheritance keywords are allowed.

Store user-editable colors as OKLCH as well. If a browser/API boundary requires another format (such as the native color input), convert only at that boundary and immediately normalize its output back to OKLCH. Do not keep duplicate palettes or fallback literals in another format. Generated output, third-party code, and raster media are not authored color definitions. Preserve the existing appearance when converting formats.
