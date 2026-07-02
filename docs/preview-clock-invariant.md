# Preview clock invariant

This document records the final preview clock invariant for PRD #53 after the
audio-master preview clock implementation landed through issues #54 through
#59. It is the authority-boundary companion to the manual sync regression path
in `docs/preview-sync-regression.md`.

## Ownership boundaries

The **Single-asset editing session** owns committed editor state:

- the active Ready media asset
- the Selection
- Audio mix decisions
- Export job state and Generated media result state

These values describe what YAFFW can export. They are not updated at preview
frame rate.

**Preview clock state** is volatile playback state owned by preview adapters,
not by the editor session. The preview transport owns the current Playhead,
playing/paused status, playback speed, preview volume, preview mute, and
selection-loop playback behavior while the media asset is loaded. Those facts
are useful for inspection and interaction, but they do not change generated
media unless the user commits an editing decision such as a new Selection or
Audio mix decision.

## Clock authority

YAFFW uses one preview clock authority per playback session.

When preview audio monitoring is active, the audio engine is the preview time
authority. The multitrack audio transport provides the media time used by the
Playhead readout, selection-loop checks, waveform/timeline playhead rendering,
and preview video synchronization.

In audio-master mode, native video is a muted visual follower. Native video is
commanded to the audio clock and receives the same playback speed, but its own
play, pause, seeked, timeupdate, and ended events do not redefine authoritative
preview state. Small follower drift can be tolerated during playback; large
drift is corrected by moving the visual follower to the audio clock.

When no audio preview transport is available, such as video-only media or an
explicit degraded fallback, native video is the preview clock authority. The
fallback is explicit and mutually exclusive with audio-master mode.

While audio preview sources or the audio monitoring adapter are still preparing,
the clock mode is pending. Playback does not start a separate native-video
free-run in that state.

## Waveform and audio monitoring

Visible WaveSurfer waveform rendering is selection context. It can render
waveform lanes, mirrored Selection affordances, the time ruler, and the visible
Playhead, but it is not the preview audio transport and does not own preview
time.

Preview audio monitoring is a separate adapter concern. It prepares temporary
browser-playable audio resources, creates the hidden multitrack transport, and
applies preview volume, preview mute, preview-only solo, Track volume, channel
handling, and include/exclude decisions to what the user hears. Those temporary
preview resources are adapter-owned browser resources and must be disposed with
the active Media asset.

## Export boundary

Export jobs continue to use the original source media plus the committed
Selection and Audio mix decisions from the Single-asset editing session.
Preview clock ownership, native-video follower correction, WaveSurfer rendering,
preview volume, preview mute, and preview-only solo do not redefine export
inputs. Export precision and Generated media inspection remain separate export
concerns.

## Regression path

The sync fixture regression path is `docs/preview-sync-regression.md` and the
fixture is `public/export-correctness-fixtures/sync-flash-click.mp4`.

The fast Vitest path models the important clock ownership cases without relying
on real browser media rendering:

- play, pause, seek, and frame-step keep the audio click timestamp, Playhead,
  and visual flash timestamp aligned
- selection-loop playback uses the authoritative audio clock at the loop
  boundary
- Audio mix changes, including Track volume, include/exclude, preview solo, and
  channel handling, keep preview audio monitoring on the audio-master clock

Manual QA with `sync-flash-click.mp4` remains the browser-rendering check for
visible A/V alignment.
