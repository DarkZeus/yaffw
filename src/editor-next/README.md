# Editor-next module map

`editor-next` contains the React route and browser adapters for the editor-next workflow. Domain state transitions stay in `src/editor-core`; this tree owns UI composition, preview adapters, browser media work, and export wiring.

- `route/` composes the editor route and the single-asset editing session React adapter. Route entry code lives in `entry/`; session adapter code lives in `session/`.
- `workbench/` owns the editor workbench frame and layout chrome. Frame implementation lives in `frame/`.
- `media-asset/` owns browser media asset inspection and the media asset context panel. Browser inspection lives in `adapters/`; panel UI lives in `panel/`.
- `media-time/` owns media-time display helpers under `format/`.
- `preview/` owns the preview viewer, transport controls, preview keyboard commands, and preview layout. Player composition lives in `player/`; transport code in `transport/`; region UI in `regions/`; preview layout, keyboard, and lifecycle code each have matching role folders.
- `audio/` owns preview audio resources, the preview audio engine, level meters, and the Audio workbench panel. Engine/resource code lives in `engine/`; meter code lives in `meters/`; panel UI lives in `panel/`.
- `selection/` owns the selection timeline, waveform lanes, and video strip. Timeline code lives in `timeline/`; waveform code in `waveform/`; video strip code in `video-strip/`.
- `export/` owns export runners, export review UI, generated media delivery, and export test harnesses. Export runners live in `runners/`; export review UI in `inspector/`; generated media code in `generated-media/`; harness code in `harness/`. Source-only investigation entries also stay under `harness/` and must not be imported by the product route.
- `media-work/` owns browser media work shared across feature adapters. Disposable scope code lives in `scopes/`; focused Mediabunny boundary adapters live in `adapters/`.
Keep types beside their implementation owner by default, and retain a separate contract module only for real shared interfaces such as worker messages, cross-module seams, or multiple production adapters or callers. Keep `*.test.*` files under `tests/`. When adding a module, place it next to the concern and role that owns the behavior it changes.
