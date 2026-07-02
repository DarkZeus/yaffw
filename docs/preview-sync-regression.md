# Preview sync regression

This is the manual QA companion for the automated preview-clock regression
coverage from PRD #53 issue #59.

## Fixture

Use `public/export-correctness-fixtures/sync-flash-click.mp4`.

The fixture is a 10.0 second MP4 with H.264 video and AAC audio. It contains
full-frame white flashes and matching 1 kHz audio clicks from 1.0s through 9.0s.
Each flash/click event lasts 100 ms.

| Event | Visual flash | Audio click | Duration |
| --- | ---: | ---: | ---: |
| 1 | 1.0s | 1.0s | 100 ms |
| 2 | 2.0s | 2.0s | 100 ms |
| 3 | 3.0s | 3.0s | 100 ms |
| 4 | 4.0s | 4.0s | 100 ms |
| 5 | 5.0s | 5.0s | 100 ms |
| 6 | 6.0s | 6.0s | 100 ms |
| 7 | 7.0s | 7.0s | 100 ms |
| 8 | 8.0s | 8.0s | 100 ms |
| 9 | 9.0s | 9.0s | 100 ms |

## Automated path

The fast Vitest regression path covers the clock ownership behavior that can be
asserted without real browser media rendering:

- play, pause, seek, frame-step: the audio-master clock owns the Playhead and
  the native video follower is moved to the matching visual flash timestamp
- selection loop: loop boundaries use the audio-master media time and return to
  the selected start without native-video free-run
- audio mix changes: Track volume, include/exclude, preview solo, and channel
  handling changes keep preview audio monitoring on the audio-master clock

These tests catch the original visible-drift failure by modelling the audio
clock at a click timestamp while the native video is still behind, then
asserting that the visual follower is synchronized to the matching flash
timestamp.

## Manual QA

Use the existing local dev server at `127.0.0.1:3000`.

1. Open YAFFW and import `sync-flash-click.mp4`.
2. Play from the start. At each click from 1.0s through 9.0s, the viewer should
   flash white at the same moment.
3. Pause near a click, seek to another event timestamp, and frame-step across
   the event. The visible flash should stay tied to the audible click and the
   Playhead readout.
4. Select roughly 2.0s to 8.0s, enable selection loop, and play through the loop
   boundary. The loop should return to 2.0s without a separate native-video
   jump or stale flash.
5. Change audio mix controls while previewing, including Track volume,
   include/exclude, preview solo, and channel handling when available. Preview
   audio may change according to the decision, but the visible flash and audible
   click should remain aligned.

Failure signal: the original visible-drift failure is present when the Playhead
or audible click reaches a fixture event while the viewer is still black, or
when the flash remains visible after the click has ended.
