# YAFFW

YAFFW is a local-first media editor for personal video editing workflows. Its core domain is preparing media assets for preview, selection, and export; acquisition from external URLs is an import path, not the product center.

## Language

**YAFFW**:
The product name for the local-first media editor; it is not expanded in product UI.
_Avoid_: Yet Another FFMPEG wrapper

**Local-first media editor**:
An editor where the user's loaded media and editing decisions are primary, and processing should happen locally when feasible.
_Avoid_: downloader, FFmpeg wrapper

**Editor workbench**:
A dense editor surface organized around continuous preview, selection, waveform context, and export review for one active media asset.
_Avoid_: dashboard, document page, project workspace, multi-asset NLE

**Customizable workbench layout**:
A user-adjustable in-frame arrangement of workbench panels that can resize, collapse, dock, tab, and be recalled without changing the single-asset editing model.
_Avoid_: project workspace, app mode, multi-asset NLE workspace, floating window, tear-off panel, external monitor workspace

**Workbench panel**:
A smallest user-movable unit of editor workbench UI that presents one coherent editing concern.
_Avoid_: floating window, app page, route, panel section

**Dock target**:
A valid in-frame landing location for placing a workbench panel while customizing the editor workbench.
_Avoid_: slot, drop zone, window target

**Panel tab group**:
An in-frame container where two or more workbench panels share the same placement and are selected by tabs.
_Avoid_: merged panel, window group

**Workbench layout preset**:
A named or portable saved arrangement of workbench panels, dock targets, and panel tab groups.
_Avoid_: project file, editing session, media asset metadata

**Default workbench layout**:
The built-in panel arrangement YAFFW shows before the user customizes the editor workbench.
_Avoid_: required layout, locked layout

**Media asset**:
A media item available to the editor as the subject of preview, selection, analysis, and export.
_Avoid_: upload, download result, server file, file path

**Asset identity**:
The app-generated identity of a media asset within YAFFW.
_Avoid_: filename, object URL, server path, source URL

**Media asset draft**:
An import result that can be loaded and analyzed into a media asset.
_Avoid_: API response, download response, uploaded file

**Ready media asset**:
A media asset that can be previewed and safely edited.
_Avoid_: fully analyzed asset, uploaded asset, preview-only asset

**Asset analysis**:
Information derived from a media asset, keyed by asset identity.
_Avoid_: asset fields, upload metadata

**Preview resource**:
A disposable browser resource used to preview a media asset.
_Avoid_: asset identity, domain source

**Import adapter**:
A mechanism that brings media from an external source into the editor as a media asset.
_Avoid_: acquisition workflow, downloader core

**Close file**:
A user action that unloads the active media asset and returns the editor to the empty import state.
_Avoid_: replace file, reset page

**Unload protection**:
A browser prompt used to warn before leaving a page when session-local editor work would be lost.
_Avoid_: persisted project, autosave

**Single-asset editing session**:
An editing session centered on exactly one active media asset and the user's decisions about that asset.
_Avoid_: project, composition, multi-asset timeline

**Editing decision**:
A user choice that changes the exported media produced from the active media asset.
_Avoid_: playback state, UI state, progress state

**Selection**:
The half-open media-time range of the active media asset that will be exported.
_Avoid_: trim, timeline

**Media time**:
A timestamp in the media asset's own time coordinate system, represented internally as integer microseconds.
_Avoid_: wall-clock time, UI frame number, floating-point seconds

**Frame timing**:
Known or estimated information for mapping between media time and frame-oriented UI actions.
_Avoid_: guaranteed FPS, frame identity

**Playhead**:
The current preview position within the active media asset.
_Avoid_: current time, cursor

**Preview transport panel**:
The workbench panel for preview playback controls, current and total media time, selection commands, global preview volume, global mute, and playback speed.
_Avoid_: timeline panel, export controls, audio mix panel

**Preview viewer panel**:
The workbench panel that visually renders the active media asset for preview.
_Avoid_: source monitor, program monitor, canvas

**Audio**:
The workbench panel identity for preview level meters and audio mix decisions for the active media asset.
_Avoid_: audio mixer, preview meters panel

**Playback speed**:
A preview setting that changes playback rate without changing exported media.
_Avoid_: output speed, frame interpolation

**Preview volume**:
A preview setting for global playback volume or mute state that does not affect exported media.
_Avoid_: audio mix decision, track volume

**Preview level meter**:
A preview-only peak-level readout in dBFS for a specific preview monitoring scope that does not change generated media.
_Avoid_: export meter, audio mix decision, loudness analysis

**Selection loop**:
A preview setting that repeats playback after playback enters the current selection without changing exported media.
_Avoid_: looped export, selected area loop, range repeat

**Keyboard shortcut**:
A UI adapter command that invokes playback or editing behavior without changing the domain language.
_Avoid_: core command, global hotkey

**Waveform**:
A visual representation of audio amplitude over time for a media asset or audio track.
_Avoid_: timeline

**Waveform lane**:
A waveform display for one audio track, used as selection context.
_Avoid_: editable track lane

**Timeline zoom**:
A UI scale control for inspecting media-time detail in the selection and waveform surface.
_Avoid_: project timeline, composition zoom

**Media track**:
A video, audio, or subtitle stream discovered inside a media asset.
_Avoid_: waveform lane, stream object

**Subtitle track**:
A timed text track associated with a media asset.
_Avoid_: video overlay, transcript, burned-in text

**Subtitle cue**:
A time-bounded text item inside a subtitle track.
_Avoid_: frame, marker, waveform label

**Audio mix decision**:
A user choice that changes how an audio track contributes to exported media.
_Avoid_: waveform setting, player volume

**Generated audio mix**:
The single generated audio track produced by combining included source audio tracks for export.
_Avoid_: downmix when meaning track merge, per-track output audio

**Track volume**:
An audio mix decision describing how loud one audio track should be in the generated mix, shown as a percentage where 100% preserves the source level and 0% silences the track.
_Avoid_: preview volume, gain

**Preview audio monitoring**:
A preview-only way to temporarily hear a subset of audio tracks without changing generated media.
_Avoid_: audio mix decision, exported solo

**Preview audio engine**:
The preview-owned audio transport that prepares source audio tracks, applies preview-relevant audio decisions, and owns audio-master preview time.
_Avoid_: multitrack adapter, audio meter, native video audio

**Output settings**:
Editing decisions that describe the intended generated media format and quality.
_Avoid_: quality modal state, export form state

**Output settings modal**:
A pre-export UI for choosing supported output settings before an export job starts.
_Avoid_: quality choices modal, FFmpeg settings modal

**Documented output profile**:
A codec and container combination documented as supported by YAFFW's browser-local media writing stack.
_Avoid_: conservative allow-list, unverified preset

**Subjective quality**:
A browser-local media writing stack quality level that resolves to codec-aware bitrate during export.
_Avoid_: YAFFW bitrate preset, hand-tuned quality tier

**Preserve source**:
An output setting choice that asks YAFFW not to set a custom value for that output dimension.
_Avoid_: keep as-is, don't touch

**Default output profile**:
The output settings YAFFW uses when the user has not chosen custom export settings.
_Avoid_: browser default, conversion preset

**Export preset**:
A named browser-local saved set of output settings that can be applied across media assets before export.
_Avoid_: user preset, output settings preset

**Export job**:
A processing run that applies editing decisions to a media asset and produces generated media.
_Avoid_: trim request, download action

**Export progress**:
The current phase and optional completion estimate of a running export job.
_Avoid_: job dashboard, server event stream

**Export cancellation**:
A user request to stop a running export job when the current export runner supports stopping safely.
_Avoid_: closing the app, deleting generated media

**Export review**:
A pre-export UI state that shows the planned output, export strategy, expected precision, and reason before the user starts an export job.
_Avoid_: quality modal, advanced export settings

**Generated media**:
Media produced by an export job.
_Avoid_: download, trimmed video

**Delivery action**:
A user action that saves, downloads, shares, or otherwise moves generated media out of the completed export result.
_Avoid_: export job, generated media

**Export capability**:
Whether and how the current processing environment can produce generated media for a media asset and editing decision set.
_Avoid_: hidden browser support check, codec flag

**Runtime capability**:
An import, preview, analysis, or export ability available in the environment where YAFFW is currently running.
_Avoid_: app mode, browser mode, desktop mode

**Supported runtime**:
A runtime that provides the browser media APIs YAFFW needs for the editor-next workflow.
_Avoid_: progressive enhancement target, universal browser support

**Smart rendering**:
An advanced export strategy that re-encodes only the parts of a selection that cannot be copied exactly, stream-copies safe encoded ranges, and combines the pieces into generated media.
_Avoid_: first-slice requirement, automatic fallback

## Relationships

- YAFFW edits one active **Media asset** at a time.
- Editor-next may use an **Editor workbench** UI inspired by professional media editors, but the product model remains a **Single-asset editing session**, not a multi-asset project or composition.
- The **Editor workbench** frame is the persistent editor-next surface across empty import, analysis, failure, unsupported-runtime, and ready states, but the tabbed inspector panel is shown only after a **Ready media asset** exists.
- The **Default workbench layout** should favor an Edit-page-style arrangement: central preview, prominent selection/waveform surface, and inspector-style panels for asset facts, export review, and delivery.
- In the **Default workbench layout**, the inspector tab group should answer what media asset is loaded and what generated media will be produced, while the center should answer what selection is being chosen.
- In the **Default workbench layout**, the Media tab should present compact source, media-track, and **Selection** context for the active **Media asset**; the **Audio** tab should present audio track strips and preview meters; the Export tab should keep runtime checks, export capability, **Export review**, and **Generated media** status together.
- In the ready state, the **Editor workbench** should fit the viewport-height editor composition; overflow belongs inside workbench panels or the selection/waveform surface rather than in an outer page scroll.
- The ready-state desktop **Default workbench layout** should use the resolved proportions: compact left inspector tab group, central preview, slim transport strip, and a lower selection/waveform surface around two-fifths of the viewport height.
- The coded first slice of the **Default workbench layout** lets users resize the boundary between the left inspector tab group and preview area, and the boundary between the preview viewer and lower transport/selection area; resizing changes working room, not **Editing decisions**.
- Surrounding **Editor workbench** chrome should use the scoped `.workbench` design tokens that carry the resolved prototype palette and border treatment.
- The long-run **Editor workbench** should use a balanced Edit-page split: preview remains the visual anchor, while the selection and waveform surface gets enough height to support serious media-time inspection.
- The **Selection** and **Waveform** interaction surface is a mature editor component; workbench visual-parity changes should preserve its established behavior and visual treatment while placing it in the lower workbench region.
- Visible chrome for the lower workbench panel should use **Selection** as the panel identity; **Waveform** labels should be reserved for audio waveform context inside that panel.
- The long-run **Editor workbench** should not include a persistent icon/status rail unless the rail has a clear navigational or state-changing function; passive markers for visible regions are avoidable chrome.
- A **Customizable workbench layout** changes how **Editor workbench** panels are arranged; it does not introduce bins, source monitors, clip stacks, multi-asset timelines, or project workspaces.
- A **Customizable workbench layout** stays inside the **Editor workbench** frame; panels should not float outside the workbench, tear off into separate windows, or target external-monitor workflows.
- A **Customizable workbench layout** may move any workbench panel to any in-frame region; panel identity and content carry meaning rather than the panel's side of the screen.
- A **Customizable workbench layout** arranges **Workbench panels** in **Dock targets** and tab groups inside the **Editor workbench** frame.
- The **Default workbench layout** exposes four initial **Dock targets**: left inspector tab group, preview viewer region, transport strip region, and selection/waveform region.
- A **Workbench panel** may be hidden behind an inactive tab; hidden does not mean removed from the layout or unavailable to the user.
- A **Panel tab group** carries the visible identity of its active **Workbench panel**; the panel body should start with useful section content rather than repeating the tab or region label.
- A visible **Workbench panel** header should carry controls, changing state, or critical readouts; headers that only name a region should be removed from visible chrome or kept as accessibility labels only.
- Inspector tab names should be noun-level **Workbench panel** identities, while labels inside each tab should name task or fact sections such as Source, Tracks, Selection, Output, Requirements, Job, or Result.
- The inspector section vocabulary is Source, Tracks, Selection, Analysis, Output, Requirements, Job, and Result; Job and Result should appear only when the export state makes them relevant.
- Primary inspector content should show compact working facts; deeper **Asset analysis** belongs under a secondary Analysis disclosure unless a failure or unsupported capability makes it immediately relevant.
- Status badges in the **Editor workbench** should be reserved for capability, blocking, running, result, or delivery states; badges that only repeat a static role or section identity are avoidable chrome.
- Dragging one **Workbench panel** onto another may create a **Panel tab group**, such as placing **Export review** and **Media asset** context in the same in-frame placement.
- The **Preview transport panel** is a **Workbench panel** distinct from the preview viewer and waveform context.
- The **Preview viewer panel** is a movable **Workbench panel** distinct from the **Preview transport panel** and waveform context.
- **Audio** is a movable **Workbench panel** distinct from **Waveform lanes**; it may present preview-only meters beside export-affecting **Audio mix decisions**.
- **Audio** presents one strip per audio **Media track** plus one combined preview meter strip; it does not introduce buses, submixes, or routing.
- In the **Default workbench layout**, **Audio** starts as an inspector tab beside Media and Export rather than as an always-visible region.
- When the active **Media asset** has no audio tracks, **Audio** remains available and shows an empty state rather than disappearing from the workbench.
- Visible preview chrome should use **Preview** or omit the title when controls/readouts are sufficient; NLE monitor labels such as program viewer are avoided because YAFFW has one active **Media asset**, not source/program monitors.
- The **Selection** and **Waveform** context is a separate movable **Workbench panel**, even though the **Default workbench layout** places it near the preview and transport controls.
- The initial movable **Workbench panels** are media asset context, **Preview viewer panel**, **Preview transport panel**, **Audio**, **Selection**/**Waveform** context, and export inspector.
- A **Customizable workbench layout** is a browser-local UI preference that may persist across refreshes and media assets without persisting the active **Single-asset editing session**.
- A **Workbench layout preset** may be imported from or exported to JSON; it saves panel arrangement, not media assets or editing decisions.
- The current coded ready-state arrangement is the **Default workbench layout** and is the fallback when a saved or imported layout cannot be applied.
- When a **Workbench layout preset** can be partially recovered, known panels from the preset are placed first and missing current **Workbench panels** are distributed round-robin through the remaining unfilled **Dock targets**.
- If a user releases a **Workbench panel** outside a **Dock target**, the panel returns to its previous placement.
- **Waveform lane** identity should be embedded inside each lane row using media-track language such as voice or desktop, rather than using separate NLE-style track labels such as V1, A1, or A2.
- A **Media asset** has **Asset identity** assigned by YAFFW; source details are provenance, not identity.
- A **Preview resource** may be derived from a **Media asset**, but it is owned by an adapter layer and must be disposed explicitly.
- An **Import adapter** produces a **Media asset draft**; it does not own editor behavior.
- A **Media asset draft** is loaded and analyzed into a **Media asset**.
- A **Media asset** may originate from local file selection or an external URL.
- A file prepared or re-encoded outside YAFFW is still just a **Media asset draft** when imported.
- **Close file** always asks for confirmation, then disposes active preview resources, clears analysis, editing decisions, and any generated media result, and returns to the empty import state.
- The first slice disables **Close file** while an **Export job** is running.
- The first slice does not persist editor state across page refreshes, but uses **Unload protection** while an active media asset, running export, or generated media result exists.
- Editor-next requires a **Supported runtime**; if WebCodecs is unavailable, the app should block access to the editor workflow with a clear unsupported-runtime message.
- Editor-next is Chromium-first; other browsers are supported only when they provide the needed standards-based media API surface.
- Runtime entry checks verify basic browser media API support; asset-specific **Export capability** is computed after a media asset is analyzed.
- In the first slice, a **Ready media asset** must be readable by the import adapter, have known positive duration, and contain at least one video **Media track**; preview decoding, waveform extraction, video-strip extraction, and export runner success are downstream outcomes, not readiness gates.
- If a media asset cannot become ready because it is unreadable, audio-only, or has no video **Media track**, the UI shows a plain failure message with technical details available on demand.
- A **Ready media asset** should not be blocked from export by codec/container preflight guesses; if the export runner fails, the failure is reported as an **Export job** result with technical details.
- The first slice targets video media with optional audio tracks; video-only media is supported, while audio-only media is deferred and should fail with a clear unsupported-file message.
- **Asset analysis** records such as metadata, frame rate, track inventory, waveform data, and export capability belong around a **Media asset**; none of them replace it as the editor's central concept.
- A **Single-asset editing session** owns the active **Media asset** and the **Editing decisions** for that asset.
- A **Single-asset editing session** owns **Audio mix decisions** because they affect generated media.
- Playback position, fullscreen state, loading progress, and analysis progress are not **Editing decisions**.
- **Timeline zoom** is inspection state owned by the UI adapter, not an **Editing decision**.
- **Playback speed** is preview state, not an **Editing decision**.
- **Preview volume** is preview state, not an **Audio mix decision**.
- A **Preview level meter** is preview state, not an **Editing decision** or **Audio mix decision**.
- **Selection loop** is preview state, not an **Editing decision**.
- **Selection loop** starts off for each newly loaded **Media asset**.
- Preview and transport chrome may follow the resolved **Editor workbench** composition as long as **Playhead**, **Playback speed**, **Preview volume**, fullscreen, seeking, and shortcut behavior are preserved.
- The **Selection loop** control belongs with preview transport controls because it changes playback behavior, not selection editing or export review.
- A **Selection** is an **Editing decision**; a **Playhead** is preview state.
- **Selection** boundaries and **Playhead** position are represented as **Media time**; frame numbers are derived labels when frame metadata is available.
- **Selection** includes media at or after its start and excludes media at or after its end.
- When **Selection loop** is enabled, playback outside the current **Selection** continues normally until it enters the selection; once playback has entered the selection, reaching the selection end seeks playback back to the selection start and continues preview playback.
- Changing **Selection** while **Selection loop** is enabled keeps the loop enabled and re-evaluates whether playback has entered the new selection.
- A **Selection** must be inside the media asset duration and last at least one known or estimated frame.
- **Frame timing** may be known from metadata or analysis, or estimated when exact frame timing is not yet available.
- When **Frame timing** is unknown, frame stepping and minimum **Selection** duration may use an estimated 30 FPS until better metadata or frame analysis is available.
- A **Ready media asset** starts with a **Selection** covering the full asset duration, represented as `[0, durationUs)`.
- A **Ready media asset** starts with default **Audio mix decisions**: every audio track included, every **Track volume** at 100%, and no preview solo state.
- Resetting **Selection** restores `[0, durationUs)` and does not move the **Playhead**.
- Resetting **Selection** does not reset **Audio mix decisions** or preview audio monitoring.
- The **Playhead** may be inside or outside the **Selection**, may equal `durationUs` as an end-position state, and never changes export output by itself.
- First-slice **Keyboard shortcuts** include Space or K for play/pause, Left/Right for one-second seek, J/L for ten-second seek, Shift+Left/Shift+Right for frame stepping, and [/] for setting selection boundaries to the playhead.
- Setting **Selection** boundaries with keyboard shortcuts uses the current **Playhead** position and does not move the playhead.
- **Selection loop** does not have a keyboard shortcut in the first implementation.
- **Keyboard shortcuts** work at the page level, but are disabled while typing into inputs, while a dialog is active, or while an export job is running.
- First-slice selection editing uses handles, range-body drag, and keyboard commands; start/end timecode inputs are deferred.
- Selection boundary drag may scrub the **Playhead** to the boundary being edited during preview, but the committed **Selection** changes when the boundary edit is completed.
- The selection surface starts with one editable **Selection** affordance for the current **Selection**; a newly loaded **Ready media asset** therefore presents a full-duration selection affordance by default.
- The first slice may show read-only **Selection** start, end, and duration labels in `HH:MM:SS.mmm` format.
- A timeline control may display a **Waveform**, **Playhead**, and **Selection**, but "timeline" is not a domain object in the single-asset editor.
- A **Media asset** contains zero or more **Media tracks**.
- A **Subtitle track** is a kind of **Media track**, but subtitle support is deferred beyond the first slice.
- A **Subtitle cue** is expressed in **Media time** and should be transformed by selection/export rules only when subtitle support is explicitly added.
- V1 export treats the active media asset as having one exportable video **Media track**; preserving, warning about, or exporting multiple video tracks is deferred even though the implementation may model video tracks as an array.
- Subtitle tracks are not exposed in the v1 **Output settings modal** or export output settings; subtitle export behavior is deferred until subtitle preview/export has its own model.
- An **Audio mix decision** is an **Editing decision** for one **Media track**.
- Audio-capable **Media tracks** are included in the mix by default so preview playback and generated media preserve all audible source context unless the user changes an **Audio mix decision**.
- **Audio mix decisions** should affect both preview playback and generated media; what the user hears in preview should match what the export contains unless **Export review** explicitly says otherwise.
- **Audio** may duplicate include/exclude and preview solo controls from **Waveform lanes**, but include/exclude should be labeled as output contribution rather than preview mute.
- **Audio mix decisions** include whether an audio track is included in the generated mix and the **Track volume** used for that mix.
- V1 export produces at most one **Generated audio mix**; preserving separate generated audio tracks is a future advanced export behavior.
- When **Output settings** choose a specific audio codec, the **Generated audio mix** is encoded with that codec.
- When **Output settings** use **Preserve source** for audio codec, the **Generated audio mix** uses the codec of the first included source audio track, subject to selected-container compatibility.
- In **Audio**, channel handling should sit with track setup controls rather than beside the live meter or fader.
- In **Audio**, **Track volume** should be presented as a vertical fader while remaining the same percentage-based **Audio mix decision**.
- In each **Audio** strip, the **Preview level meter** should be the visual anchor and the **Track volume** fader should sit adjacent rather than acting as the central object.
- The combined meter in **Audio** should not introduce a master fader unless YAFFW adds an explicit master gain **Audio mix decision**.
- The first combined **Audio** strip should be meter-only plus identity/status; it should not show **Track volume**, channel handling, master gain, or routing controls.
- Preview mixing and export mixing should use the same **Track volume** interpretation so the same percentage produces matching loudness intent in preview and generated media.
- Excluding an audio track from the generated mix is distinct from setting its **Track volume** to 0%; excluded tracks do not contribute to the generated audio, while included tracks at 0% contribute silence and remain part of the mix decision.
- Excluding an audio track is a fast contribution decision and should preserve the track's remembered **Track volume** for later re-inclusion.
- **Preview audio monitoring** may temporarily solo tracks during preview, but it does not change **Audio mix decisions** or generated media.
- When preview solo is active, soloed tracks are audible in preview even if they are excluded from generated media; the UI should allow both states to be visible at once.
- Preview solo changes which tracks are monitored, not their loudness; **Track volume** still applies to soloed preview tracks.
- **Preview volume** and preview mute are global preview settings and do not change **Audio mix decisions** or generated media.
- **Preview level meters** ignore global **Preview volume** and preview mute because those settings change listening comfort rather than the monitored signal.
- **Preview level meters** use a dBFS scale where 0 dBFS is the clipping ceiling and the first visual floor is around -72 dBFS.
- **Preview level meters** should keep a visible clip warning briefly after clipping occurs, while the live meter level continues to decay normally.
- **Preview level meters** should use configurable color zones with OBS-style sample-peak defaults: green below -20 dBFS, yellow from -20 dBFS to -9 dBFS, red above -9 dBFS, and clipping at 0 dBFS.
- Implementation naming for the default **Preview level meter** color-zone config should use product language such as `previewPeakMeterZones`, not external-source names such as OBS.
- The first **Audio** branch should not introduce a user-facing settings panel for **Preview level meter** thresholds; threshold configurability is implementation plumbing for future settings.
- A reusable **Preview level meter** component should be presentation/config driven and receive prepared dBFS display values plus generic display state; it may know about channel values, visual clamping, labels, orientation, color zones, and state presentation, but not signal math, tracks, solo, include/exclude, channel handling, or preview playback policy.
- Clip event and clip-hold state should be prepared outside the reusable **Preview level meter** component and passed in as display state; the component should render clip indicators rather than deciding clip timing.
- Prepared **Preview level meter** channel values should include required `peakDb` and `clipHeld` fields plus an optional display `label` such as `L`, `R`, or `M`; the reusable component renders supplied labels without deriving channel identity.
- The reusable **Preview level meter** component API should accept `channels: PreviewMeterChannel[]` for every layout, including single-channel meters, and should avoid mono- or stereo-specific props.
- A reusable **Preview level meter** instance represents one logical signal scope and should render its prepared channels as parallel bars sharing the same scale, labels, zones, and tick marks rather than requiring one meter component per channel.
- Preview-metering domain and adapter code may use `channelLayout` terminology for mono, stereo, surround, or custom source layouts; the reusable **Preview level meter** component should only receive the prepared `channels` array.
- When preview-metering cannot identify a source channel layout, the adapter should prepare neutral channel labels such as `Ch 1` and `Ch 2` rather than leaving channel labels blank.
- A **Preview level meter** may be rendered vertically or horizontally, but **Audio** should use vertical meter strips.
- **Audio** meter strips should be visually optimized for mono and stereo while allowing wider surround or custom channel layouts to extend horizontally with scrolling rather than hiding or collapsing channels.
- **Preview level meters** may show fixed dBFS tick labels in either orientation, and labels may be disabled when the surrounding UI already provides enough scale context.
- Vertical **Preview level meters** should place fixed dBFS tick labels beside the meter; live numeric readouts are secondary and not required for the first version.
- **Preview level meters** should preserve supplied channel identity and render the prepared channel list without assuming mono or stereo; sources may be mono, 2.0, 2.1, 5.1, 7.1, or custom channel layouts.
- **Preview level meters** are live playback readouts; when preview is paused or stopped, they should decay toward silence rather than snap to the paused playhead's analyzed level.
- **Preview level meter** decay after pause or stop is presentation behavior; the **Preview audio engine** should report actual playback signal state rather than emitting artificial fading levels.
- In a **Preview audio engine** graph, per-track **Preview level meter** taps should observe each track after channel handling and **Track volume**, while the combined **Preview level meter** tap should observe the monitored mix after include/exclude, **Track volume**, channel handling, and preview solo.
- All **Preview level meter** taps in a **Preview audio engine** graph should sit before global **Preview volume** and preview mute.
- Live **Preview level meter** sampling should use a short peak window around 50 ms so the meter remains responsive without flickering on individual samples.
- Cached peak buckets for **Preview level meters** are a deferred performance optimization, not part of the first meter architecture.
- **Preview level meters** should be fed by a preview-metering adapter rather than directly reading the multitrack preview output, so metering can follow its own preview-signal rules.
- The first preview-metering adapter should read decoded per-track sample data at the current **Playhead** rather than attaching to the live browser audio output graph.
- The preview-metering adapter may reuse lower-level audio preparation and worker infrastructure used by waveform extraction, but it should not depend on **Waveform lane** artifacts or waveform availability.
- **Preview level meter** preparation failures should be isolated per audio **Media track**; one failed track meter should not disable the whole **Audio** panel or other track controls.
- **Preview level meter** preparation or display failures should not block preview playback or export-affecting controls; they only reduce visual monitoring confidence.
- Unavailable **Preview level meters** should reserve their normal strip space and render a disabled/unavailable state rather than being removed and shifting the **Audio** layout.
- Per-track **Preview level meter** preparation failures should expose a per-track retry action so successful meter preparation for other tracks does not need to be repeated.
- Per-track **Preview level meter** retry controls belong to the **Audio** strip, not inside the reusable meter component, because retry is track and adapter behavior.
- **Audio** should distinguish **Preview level meter** states such as preparing, unavailable, and ready rather than presenting all non-moving meters as silence.
- The reusable **Preview level meter** component may render a small generic state union such as `preparing`, `unavailable`, and `ready`, but the **Audio** panel or preview-metering adapter should decide which state applies.
- Silence should be represented as a ready **Preview level meter** whose prepared channel values sit at the visual floor, not as a separate meter lifecycle state.
- `channels` should remain part of the **Preview level meter** display contract for non-ready states; when the channel layout is known, callers should provide placeholder channels at the visual floor, and when it is unknown the strip may render a generic preparing/unavailable meter body.
- The reusable **Preview level meter** component may accept a short generic message for preparing or unavailable states, while track-specific explanation and retry controls belong to the **Audio** strip.
- A **Preview level meter** may be scoped to one audio **Media track** or to the combined preview output, but it does not describe or validate generated media.
- A per-track **Preview level meter** shows that track's effective signal after **Track volume** and channel handling, and does not disappear just because another track is soloed.
- Changing **Track volume** should update the affected track's **Preview level meter** and the combined **Preview level meter** because meters reflect the monitored signal after track-level mix decisions.
- Per-track **Preview level meter** clip detection should happen after **Track volume** and channel handling, so reducing track volume can clear effective-signal clipping.
- Changing channel handling should update the affected track's **Preview level meter** values and displayed channel layout because meters reflect the monitored signal after channel handling.
- An excluded track's per-track **Preview level meter** shows silence and should be visually marked as excluded, unless that track is soloed for **Preview audio monitoring**.
- A combined **Preview level meter** follows **Preview audio monitoring**, including preview solo, rather than the generated-media mix.
- A combined **Preview level meter** should preserve the monitored output channel layout instead of downmixing to a single mono peak, so channel imbalance and surround routing remain visible.
- When tracks with different channel layouts are combined, preview metering should use the same channel-mapping policy as preview and export mixing rather than inventing a meter-only layout.
- In the first implementation, the combined **Preview level meter** may use stereo 2.0 output channels when the actual preview/export mixer outputs stereo, even if per-track meters preserve richer source channel layouts.
- If an audible track's metering data is unavailable, the combined **Preview level meter** should show a partial or unavailable state rather than silently exclude that track from the displayed combined level.
- When a **Media asset** has audio tracks and preview can use a **Preview audio engine**, that engine should be the preview transport authority for play, pause, seeking, playback speed, and audio monitoring; the native video element should act as the visual renderer synchronized to the shared **Playhead**.
- The **Preview audio engine** should completely replace the hidden `wavesurfer-multitrack` preview transport rather than run beside it as a long-term alternate path; WaveSurfer may still be used for visual **Waveform lanes** because they are selection context, not preview audio transport.
- `wavesurfer-multitrack` should be removed once no preview transport code imports it; `wavesurfer.js` may remain only for visual waveform rendering.
- Implementation names for the replacement should use **Preview audio engine** language rather than `multitrack` package language, while preserving support for multiple embedded audio **Media tracks**.
- A **Preview audio engine** may expose each embedded audio **Media track** through adapter-owned preview audio resources derived from the source media; those resources must be disposed with the active **Media asset**.
- The first **Preview audio engine** implementation may use full-track decoded `AudioBuffer` resources for simplicity, while preserving **Preview audio resource** as the domain term so chunked resources can replace them later.
- A **Preview audio engine** should apply channel handling during playback routing rather than baking channel fixes into prepared **Preview audio resources**, so **Audio mix decisions** can change without regenerating those resources.
- **Track volume**, include/exclude, preview solo, and preview mute should be applied by the **Preview audio engine** graph at playback time rather than baked into prepared **Preview audio resources**.
- Preview audio resource preparation should eagerly prepare every audio **Media track** for consistent mix-capable preview, even when some tracks are currently excluded by **Audio mix decisions**; preparation may run in parallel, but preview audio readiness should not lazily omit unprepared tracks.
- Preview and export may share audio graph-building or mix-plan logic so both consume the same **Audio mix decisions**; preview renders through a live audio context, while export renders the equivalent mix offline before handing audio to the media output pipeline.
- While preview audio resources are being prepared, video may be visually previewable but audio monitoring controls should remain unavailable and native video audio should not be used as a temporary substitute.
- If preview audio resource preparation fails for a **Media track**, the **Preview audio engine** may continue in an explicit degraded state; audio monitoring should not silently omit that track, and the failed track should expose a retry action that regenerates only that track's preview audio resource.
- When a **Preview audio engine** is active, the native video element should be muted so all audible preview output comes from the engine.
- When a **Preview audio engine** is active, the engine's audio clock is authoritative, including in explicit degraded preview states; if native video playback drifts from the shared **Playhead**, video should be corrected toward the engine time.
- **Playback speed** applies to the whole preview; when a **Preview audio engine** is active, the engine and synchronized video renderer should use the same speed value and preserve sync, while pitch preservation is not required for the first implementation.
- For video-only media, the native video element may remain the preview transport authority.
- **Output settings** are **Editing decisions**; editor-next v1 lets the user choose supported resolution, bitrate, codec, and container before starting an export job.
- The **Default output profile** is MP4 with H.264 video and AAC audio when the current **Runtime capability** supports it; editor-next does not silently fall back to another generated-media format.
- Under the **Default output profile**, included audio tracks are mixed into one generated AAC audio track; custom **Output settings** may choose another supported audio codec for the same single **Generated audio mix**.
- If all audio tracks are excluded by **Audio mix decisions**, export remains valid and produces generated media with no audio track.
- The v1 **Output settings modal** should expose resolution, **Subjective quality** or custom target bitrate, and **Documented output profiles** rather than a conservative app-owned codec/container allow-list.
- Every customizable v1 **Output settings** dimension should include **Preserve source** as the first/default choice where that dimension can be left unspecified.
- Codec and container choices in the **Output settings modal** should remain flexible: users may choose any container, video codec, and audio codec combination documented as supported by the browser-local media writing stack, with the UI filtering choices by container compatibility instead of limiting users to a small combined profile list.
- Audio codec defaults to **Preserve source**; if the selected container cannot contain the source audio codec, the **Output settings modal** must require a compatible audio codec choice before export.
- Video and audio codec choices may be changed automatically when a selected container cannot contain the preserved source codec; the modal should make the replacement visible rather than blocking the user on a manual codec choice.
- Automatic replacement codec choices should follow the browser-local media writing stack's documented codec order for the selected container.
- If no documented compatible codec/container combination can satisfy the current **Output settings**, the **Output settings modal** should block applying settings and export should remain blocked with a visible error.
- YAFFW should trust documented codec/container support in the browser-local media writing stack; if a documented profile fails in a specific runtime, the failure is reported as an **Export job** failure or profile availability issue, not treated as a reason to hide the profile by default.
- Active v1 resolution choices are limited to keeping the source resolution or downscaling; non-AI canvas upscaling may be possible in the media writing stack, but it should not be presented as a v1 quality feature.
- The default v1 bitrate choice is **Preserve source**: YAFFW does not set a target bitrate unless the user chooses a **Subjective quality** or Custom bitrate.
- V1 bitrate choices should use **Preserve source**, the media writing stack's **Subjective quality** levels, and Custom for an explicit target bitrate; YAFFW should not invent separate bitrate preset names such as Compact, Balanced, or High.
- **Preserve source** for bitrate means "do not set a user target bitrate"; if other **Output settings** force transcoding, the media writing stack may still choose the bitrate needed for that conversion.
- V1 should let users choose video and audio bitrate/quality independently, using **Preserve source**, **Subjective quality**, or Custom bitrate for each.
- The **Output settings modal** should explain that changing output settings may re-encode video and can change output size, quality, and processing time.
- The export runner should let the browser-local media writing stack avoid transcoding when possible; YAFFW should not force transcode merely because the user opened or applied **Output settings**.
- Applying the **Output settings modal** commits **Output settings** to the **Single-asset editing session** immediately; **Export review** should reflect the applied settings before an **Export job** starts.
- Applying changed **Output settings** invalidates any existing **Generated media** result because that result no longer represents the current editing decisions.
- Closing or cancelling the **Output settings modal** discards draft changes; only Apply commits draft **Output settings** to the **Single-asset editing session**.
- Reset inside the **Output settings modal** restores the draft to the applied settings snapshot from when that modal session was opened; it does not reset to product defaults unless those were the opening values.
- V1 includes browser-local **Export presets** with simple save, load, update/overwrite, and delete actions inside the **Output settings modal**.
- V1 **Export presets** include user-created presets plus one system-managed Last used settings preset; built-in preset templates are deferred.
- **Export presets** store **Preserve source** symbolically; when a preset is loaded for another media asset, preserved dimensions resolve against that active asset's source settings rather than the asset that created the preset.
- Loading an **Export preset** changes only the modal draft; Apply is still required before the preset affects the **Single-asset editing session** or **Export review**.
- Saving an **Export preset** captures the current modal draft without committing that draft to the **Single-asset editing session**.
- Invalid **Output settings** drafts block Apply, saving a new **Export preset**, and updating an existing **Export preset**.
- Deleting a user-created **Export preset** should use a small confirmation popover; the system-managed Last used settings preset cannot be deleted.
- User-created **Export preset** names are case-sensitive and may collide only after an explicit overwrite-or-cancel choice; overwriting replaces the existing preset with that exact name rather than creating a second same-name preset.
- Last used settings is a reserved system preset name.
- User-created **Export preset** names are trimmed before validation and storage; empty names are invalid.
- **Export presets** persist internally as versioned browser-local JSON; user-facing preset import/export files are deferred beyond v1.
- Active **Output settings** belong to the **Single-asset editing session** and are not restored across page refresh in v1.
- The Last used settings preset is populated whenever **Output settings** are applied, loads into modal draft like any other preset, requires Apply, and is not auto-applied to new media assets.
- The v1 **Output settings modal** should organize settings into General, Video, Audio, AI, and Subtitles tabs; AI and Subtitles are disabled/deferred tabs until those export models exist.
- AI upscaling and frame interpolation are future **Output settings** ideas; they may appear as disabled/deferred controls in the **Output settings modal**, but should not appear active until an export runner can honor them.
- GPU vendor choices such as NVENC, AMF, and VideoToolbox are legacy FFmpeg-oriented language and should not appear in v1 browser-local **Output settings**; WebCodecs capability should be surfaced through runtime support and codec/container availability instead.
- A **Waveform** may be derived from a **Media track**, but it is not the track and is not required for readiness or export.
- The first slice should load per-track **Waveform lanes** progressively for audio tracks when available because separate tracks may carry different selection context, such as desktop audio versus voice.
- A **Waveform lane** may expose only quick audio controls for include/exclude and preview solo; dense audio controls belong in **Audio**.
- **Waveform lane** audio controls should be compact and colocated with track identity in the lane header, so fast track contribution and monitoring decisions stay visually tied to the waveform they affect.
- **Track volume** and channel handling should live in **Audio**, not in **Waveform lanes**.
- Per-track **Preview level meters** should not be embedded as persistent decoration inside **Waveform lanes**; lanes remain selection context.
- **Waveform lane** extraction failure does not block readiness or export; unavailable lanes should be shown as unavailable selection context without a selection affordance.
- The first slice shows all available **Waveform lanes** and uses vertical scrolling if the lanes exceed the available viewport.
- All **Waveform lanes** align to the same **Media time** ruler and share one **Selection** and **Playhead** overlay.
- When the waveform adapter can preserve existing behavior, the **Waveform**, mirrored **Selection** affordances, **Playhead** cursor, time ruler, and **Timeline zoom**/scroll should be rendered by the same media-time surface rather than split across independent overlays.
- The selection and waveform surface should keep explicit editor zoom controls; wheel or pinch zoom is a progressive interaction enhancement, not a requirement for the first Wavesurfer adapter.
- The selection and waveform surface should preserve the explicit keep-**Playhead**-centered control; when enabled, the waveform adapter may use its native auto-scroll and auto-center behavior, and when disabled it should avoid auto-centering.
- If **Waveform lanes** present per-lane selection affordances, those affordances mirror and edit the same **Selection**; they do not create track-specific selections.
- Editing the selection affordance from any **Waveform lane** updates the shared **Selection** and synchronizes the mirrored selection affordance in every other lane.
- During active selection dragging, all ready-lane selection affordances should mirror the draft range as local draft UI on `requestAnimationFrame`, while the session-owned **Selection** is committed only after the drag completes.
- A loading or failed **Waveform lane** does not show a mirrored selection affordance; when a lane finishes loading, its selection affordance is synchronized to the current shared **Selection**.
- If a **Waveform lane** finishes loading while another lane is actively editing a draft selection, the newly loaded lane waits for the committed **Selection** before showing its mirrored selection affordance.
- Clicking a **Waveform lane** seeks the shared **Playhead** to that media time.
- Dragging empty **Waveform lane** space does not create or replace **Selection**; selection changes use the existing selection affordance edges/body or keyboard commands.
- The first slice includes minimal **Timeline zoom** with horizontal scrolling while keeping waveform lanes, selection, and playhead aligned.
- An **Export job** consumes one **Media asset** and the session's **Editing decisions**.
- An **Export job** runs from a snapshot of the **Media asset** and **Editing decisions** captured when the job starts.
- A running **Export job** reports minimal **Export progress** such as preparing, encoding, muxing, or finalizing.
- **Export cancellation** is available only when the active export runner can stop safely; the UI should not imply cancellation when it is unsupported.
- The first slice disables editing changes while an **Export job** is running.
- The **Output settings modal** and **Export preset** mutations are blocked while an **Export job** is running.
- **Runtime capability** determines which import, preview, analysis, and export paths are available; it does not create a separate editor model.
- **Export capability** is checked before an **Export job** starts and should expose the planned export strategy, expected precision, and user-facing reason without using codec/container preflight guesses to block otherwise valid media.
- If the default output runner cannot convert or mux the active asset, the asset remains ready and the failure is reported on the **Export job**.
- The v1 Export tab should keep **Output settings**, **Export review**, **Export progress**, and **Generated media** status together while keeping their meanings distinct.
- **Export review** should summarize the chosen **Output settings**, generated audio mix, export strategy, expected precision, and reason before the user starts an export job.
- **Export review** should describe export strategies in product language such as fast export or precision export, while implementation labels may remain technical.
- The first-slice **Export review** shows the chosen export strategy; it does not let the user manually choose between strategies.
- **Export review** should summarize the generated audio mix from **Audio mix decisions**, such as how many audio tracks are included and that included tracks are mixed to AAC under the **Default output profile**.
- **Export review** should not treat preview-only solo state as part of the generated audio mix.
- **Smart rendering** is a future **Export capability**, not a requirement for the first local-file editor slice.
- An **Export job** produces **Generated media**; saving or downloading that result is a separate delivery concern.
- The first slice should require an explicit **Delivery action** such as download after export succeeds; auto-download can be a later preference.
- The first slice does not preview **Generated media** before delivery.
- **Generated media** may become a **Media asset draft** only through explicit user action, but this is deferred beyond the first slice.

## Example dialogue

> **Dev:** "If a Twitter URL requires cookies, does export logic need to know?"
> **Domain expert:** "No. The **Import adapter** either produces a **Media asset** or fails before editing begins."

## Flagged ambiguities

- "download" and "acquisition" were previously treated as core product areas. Resolved: acquisition is an **Import adapter** feeding **Media assets** into the **Local-first media editor**.
- "project" and "timeline" imply multi-asset composition. Resolved: YAFFW's next architecture is a **Single-asset editing session**; multi-asset composition is out of scope until it earns its own model.
- "Photoshop/Premiere-style panels" refers to **Customizable workbench layout** mechanics, not Premiere-style project concepts.
- "slot" was used to mean a valid panel landing place. Resolved: use **Dock target** for user-facing layout mechanics.
- "media asset inspector" was used informally for the current **Media asset** context panel. Resolved: keep **Media asset** context language unless the product deliberately renames that panel.
- "quality choices modal" came from the legacy FFmpeg-oriented UI. Resolved: use **Output settings modal** for the v1 browser-local settings UI, while **Export review** remains the pre-export summary.
