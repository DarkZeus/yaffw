# YAFFW landing — design notes

Research pass (Nov 2026) over Raycast, Linear, Notion, Resend and Vercel, and what this page borrows.

| Site    | Practice observed                                                                                                                              | Used here                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Raycast | Dark canvas, one saturated brand light source behind the hero; real product UI as the hero object; dock-like tabs                              | Amber "selection" glow behind the hero; real workbench screenshot in a window frame; keycap shortcuts |
| Linear  | Headline blurs/fades in; two-tone copy (bright statement + muted continuation); tilted product shot that flattens on scroll; mono micro-labels | Blur-in hero, two-tone section leads, perspective tilt → flat on scroll, mono eyebrows                |
| Notion  | Plain, confident type; bento cards each with one small live illustration; generous whitespace                                                  | Feature bento where each card has one live illustration (meters, formats, layout)                     |
| Resend  | Serif/sans contrast, near-black gradients, a single glossy hero object, thin hairline borders                                                  | Hairline borders with highlight top edge, glossy app icon as the CTA object                           |
| Vercel  | Strict grid, guide lines, almost no color — color is reserved for meaning                                                                      | Achromatic surfaces; amber only for selection/CTA, red only for the playhead                          |

## Principles

- Colors come from YAFFW's `.workbench` tokens in `src/styles.css` (all `oklch`, achromatic hues as `none`). Amber = selection, red = playhead, same as in the app.
- Show the product, not abstractions: a real screenshot plus an interactive selection timeline that mirrors the app's controls and shortcuts.
- Motion is short, ease-out, interruptible, and off under `prefers-reduced-motion`.
- No build step: open `index.html` or serve the folder.
