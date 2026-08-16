# Rotated Media Preview verification

Issue [#107](https://github.com/DarkZeus/yaffw/issues/107) reproduced a split geometry authority: analysis and the Preview aperture resolved a rotated Media asset to 90×160, while Vidstack's player/provider/native-video chain retained its stylesheet's 16:9 default. The accepted contract is that both layers receive the primary video Media track's validated display aspect ratio. Container rotation stays with the browser's native media pipeline; YAFFW does not add a transform.

## Regression fixtures

The fixtures under `public/preview-orientation-fixtures/` render the same upright 90×160 portrait target. Their encoded pixels are pre-rotated and their MP4 display matrix restores the target orientation.

| Fixture | Coded dimensions | Container rotation | Mediabunny display dimensions | Preview ratio |
| --- | ---: | ---: | ---: | ---: |
| `rotation-0.mp4` | 90×160 | 0° | 90×160 | 9:16 |
| `rotation-90.mp4` | 160×90 | 90° | 90×160 | 9:16 |
| `rotation-180.mp4` | 90×160 | 180° | 90×160 | 9:16 |
| `rotation-270.mp4` | 160×90 | 270° | 90×160 | 9:16 |

They were generated with FFmpeg 7.1.1 from a portrait target containing distinct top, middle, and bottom color bands, a directional marker, and upright `TOP` text. The 90°, 180°, and 270° encoded frames use `transpose=clock`, `hflip,vflip`, and `transpose=cclock` respectively before the matching display rotation is attached with `-display_rotation:v:0`. This makes an extra, missing, or reversed browser rotation immediately visible.

## Automated verification

`preview-orientation-fixtures.test.ts` opens the committed MP4 files through the production Mediabunny analyzer and confirms all four become 90×160 display tracks before checking the shared 9:16 Preview ratio. `preview-aperture-layout.test.ts` separately covers ordinary landscape and portrait ratios plus no-video, missing, zero, negative, non-finite, and infinite dimensions. `native-preview-player.test.tsx` locks down the original mismatch by requiring the aperture and Vidstack player to receive the same portrait ratio and confirms YAFFW applies no video transform.

The full repository verification for this change is:

```text
npm run typecheck  # passed
npm run test       # passed: 61 files, 391 tests
npm run build      # passed, including production Vite build and TypeScript
npx biome check <affected TypeScript and TSX files>  # passed
```

## Chromium verification

Run the user-owned app at `127.0.0.1:3000`, import each fixture through the local-file picker, and inspect the Preview aperture, `[data-media-player]`, `[data-media-provider]`, and native `<video>` geometry. For each fixture:

1. Confirm the marker and `TOP` text are upright with no CSS transform on the native video.
2. Confirm the aperture, player, provider, and video use 9:16 geometry inline.
3. Enter fullscreen and confirm the orientation and intrinsic ratio remain unchanged.
4. Exit fullscreen and import the same fixture again from a fresh empty state to confirm repeatability.
5. Reload the page, import it again, and confirm the same orientation and geometry.

The live pass ran on 2026-08-16 in the Codex in-app Chromium/WebCodecs runtime; that runtime did not expose a browser version string to the verification interface.

- All four fixtures were reported by the app as 90×160 and rendered the directional marker and `TOP` text upright.
- Inline computed `aspect-ratio` was `0.5625 / 1` on the aperture, `[data-media-player]`, `[data-media-provider]`, and native `<video>`. Chromium reported the native video as 90×160 with `object-fit: contain` and `transform: none`.
- Fullscreen checks on the 0° and 90° fixtures preserved `0.5625 / 1` on the player, provider, and video. The 90° player exposed Vidstack's `data-fullscreen` state, Chromium kept the native video at 90×160 with no transform, and the upright target remained correctly letterboxed.
- The 90°, 180°, and 270° fixtures produced identical geometry. A second fresh import of the 90° fixture matched the first exactly, and importing it after a page reload produced the same upright 9:16 result.
- The ordinary 160×90 landscape fixture retained `1.77778 / 1` across player, provider, and video, with native 160×90 dimensions and no transform.
- Audio-only media remains defined by the existing readiness contract: it stops at the import failure state instead of entering Native Preview. The no-video and partially missing-dimension helper paths retain the stable 16:9 fallback.
- Browser console inspection showed no Preview or media errors. The only warning was unrelated development-tooling update noise from React Scan.
