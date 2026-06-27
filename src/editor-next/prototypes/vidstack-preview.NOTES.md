# PROTOTYPE - Vidstack preview player

Question: can Vidstack Default Layout replace the native preview player UI while keeping YAFFW's editing model outside the player?

Run:

```sh
pnpm run prototype:vidstack-player
```

Open `/vidstack-preview-prototype` and check:

- MP4 playback uses Vidstack Default Layout without the browser native controls.
- HLS playback reaches Vidstack's HLS provider path.
- Subtitles and chapters appear in the player menus for the sample media.
- Adaptive qualities are visible when the source/provider exposes them.
- Chapters are not duplicated outside the player.
- Clicking a chapter in the player replaces the YAFFW Selection with `[chapter.start, nextChapter.start)`. The final chapter ends at media duration.
- The YAFFW Selection timeline remains visible outside the player as state, not as chapter navigation.
- Local files can be loaded through a Blob URL so the prototype can be tested against real imported media.

This route is intentionally isolated from `NativePreviewPlayer`. Delete it or absorb the useful pieces after the player decision is made.
