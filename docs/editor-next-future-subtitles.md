# Future subtitle support

Subtitle support is deferred beyond the first editor-next slice. The first slice should not preview, edit, import, or export subtitles, but the core language should leave room for subtitle tracks as media tracks.

## Current project state

- The previous YAFFW implementation does not have a subtitle feature to migrate.
- `CONTEXT.md` already treats subtitle streams as possible media tracks.
- The current editor UI and hooks are video/audio-oriented: preview uses video playback, waveform extraction targets audio tracks, and export behavior is built around video/audio output.

## Current web/media constraints

- Browsers expose subtitle/caption display through WebVTT text tracks on media elements.
- Browser `<track>` elements and `HTMLMediaElement.addTextTrack()` work with time-aligned text cues.
- Mediabunny currently supports WebVTT as a subtitle codec for writing, but its docs state subtitle tracks are not currently supported for reading.
- Mediabunny can add subtitle tracks to output files through `Output.addSubtitleTrack()` and `TextSubtitleSource('webvtt')`.
- This means future YAFFW subtitle support should probably start with sidecar subtitle files or app-authored subtitle cues, not embedded subtitle extraction from arbitrary input files.
- WebVTT is the browser-native preview/write target, but it does not have to be the only accepted source format.
- SRT is a good candidate source format because it can be parsed into plain timed subtitle cues and normalized to WebVTT for preview/export.
- ASS/SSA is a harder candidate source format because faithful support includes styling, positioning, karaoke timing, and font behavior; a plain-text import would lose part of the source format.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/track
- https://mediabunny.dev/guide/reading-media-files
- https://mediabunny.dev/guide/media-sources
- https://mediabunny.dev/guide/supported-formats-and-codecs
- https://mediabunny.dev/guide/writing-media-files

## Likely future slices

1. Sidecar subtitle preview
   - Import a `.vtt` or `.srt` file alongside the active media asset.
   - Parse both formats into internal subtitle cues.
   - Normalize preview through WebVTT/native text-track APIs.
   - Attach it as a subtitle track to the current single-asset session.
   - No subtitle editing and no subtitle export yet.

1a. Additional sidecar source formats
   - Consider `.ass`/`.ssa` only after deciding whether YAFFW preserves styling or imports plain text only.
   - Keep the browser preview path WebVTT unless a dedicated renderer is introduced.

2. Selection-aware subtitle export
   - When exporting a selected range, include a transformed subtitle track or sidecar file.
   - Drop cues outside the selection.
   - Clip cues that overlap selection boundaries.
   - Rebase cue times so exported media starts at zero.

3. Subtitle editing
   - Add, edit, split, merge, delete, and retime subtitle cues.
   - Treat cue edits as editing decisions.
   - Add undo/redo before this becomes serious.

4. Burned-in subtitles
   - Render subtitle text into video frames during export.
   - Requires re-encoding.
   - Should be an explicit output setting, not the default subtitle behavior.

## Open questions

- Is the first useful subtitle workflow previewing existing subtitles, exporting subtitles with selected clips, creating subtitles, or burning subtitles into video?
- Should YAFFW prefer soft subtitles first, burned-in subtitles first, or keep both as separate future output settings?
- Should subtitle files be sidecar media asset drafts, session attachments, or editing decisions?
- Should SRT be accepted and converted to WebVTT in the first subtitle slice, or added in the next subtitle slice?
- Should ASS/SSA be unsupported at first, imported as plain text with styling loss, or rendered faithfully through a dedicated renderer?
