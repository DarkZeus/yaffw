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

**Playback speed**:
A preview setting that changes playback rate without changing exported media.
_Avoid_: output speed, frame interpolation

**Preview volume**:
A preview setting for global playback volume or mute state that does not affect exported media.
_Avoid_: audio mix decision, track volume

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

**Track volume**:
An audio mix decision describing how loud one audio track should be in the generated mix, shown as a percentage where 100% preserves the source level and 0% silences the track.
_Avoid_: preview volume, gain

**Preview audio monitoring**:
A preview-only way to temporarily hear a subset of audio tracks without changing generated media.
_Avoid_: audio mix decision, exported solo

**Output settings**:
Editing decisions that describe the intended generated media format and quality.
_Avoid_: quality modal state, export form state

**Default output profile**:
The output settings YAFFW uses when the user has not chosen custom export settings.
_Avoid_: browser default, conversion preset

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
- In the **Default workbench layout**, the Media tab should present compact source, media-track, and **Selection** context for the active **Media asset**; the Export tab should keep runtime checks, export capability, **Export review**, and **Generated media** status together.
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
- Visible preview chrome should use **Preview** or omit the title when controls/readouts are sufficient; NLE monitor labels such as program viewer are avoided because YAFFW has one active **Media asset**, not source/program monitors.
- The **Selection** and **Waveform** context is a separate movable **Workbench panel**, even though the **Default workbench layout** places it near the preview and transport controls.
- The initial movable **Workbench panels** are media asset context, **Preview viewer panel**, **Preview transport panel**, **Selection**/**Waveform** context, and export inspector.
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
- In the first slice, a **Ready media asset** must be previewable, have known duration and enough track inventory to edit, and be exportable with the default output profile.
- If a media asset cannot become ready because default export is unsupported, the UI shows a plain failure message with technical details available on demand.
- The first slice targets video media with optional audio tracks; video-only media is supported, while audio-only media is deferred and should fail with a clear unsupported-file message.
- **Asset analysis** records such as metadata, frame rate, track inventory, waveform data, and export capability belong around a **Media asset**; none of them replace it as the editor's central concept.
- A **Single-asset editing session** owns the active **Media asset** and the **Editing decisions** for that asset.
- A **Single-asset editing session** owns **Audio mix decisions** because they affect generated media.
- Playback position, fullscreen state, loading progress, and analysis progress are not **Editing decisions**.
- **Timeline zoom** is inspection state owned by the UI adapter, not an **Editing decision**.
- **Playback speed** is preview state, not an **Editing decision**.
- **Preview volume** is preview state, not an **Audio mix decision**.
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
- An **Audio mix decision** is an **Editing decision** for one **Media track**.
- Audio-capable **Media tracks** are included in the mix by default so preview playback and generated media preserve all audible source context unless the user changes an **Audio mix decision**.
- **Audio mix decisions** should affect both preview playback and generated media; what the user hears in preview should match what the export contains unless **Export review** explicitly says otherwise.
- **Audio mix decisions** include whether an audio track is included in the generated mix and the **Track volume** used for that mix.
- Preview mixing and export mixing should use the same **Track volume** interpretation so the same percentage produces matching loudness intent in preview and generated media.
- Excluding an audio track from the generated mix is distinct from setting its **Track volume** to 0%; excluded tracks do not contribute to the generated audio, while included tracks at 0% contribute silence and remain part of the mix decision.
- Excluding an audio track is a fast contribution decision and should preserve the track's remembered **Track volume** for later re-inclusion.
- **Preview audio monitoring** may temporarily solo tracks during preview, but it does not change **Audio mix decisions** or generated media.
- When preview solo is active, soloed tracks are audible in preview even if they are excluded from generated media; the UI should allow both states to be visible at once.
- Preview solo changes which tracks are monitored, not their loudness; **Track volume** still applies to soloed preview tracks.
- **Preview volume** and preview mute are global preview settings and do not change **Audio mix decisions** or generated media.
- When a **Media asset** has audio tracks and preview can use a mix-capable multitrack adapter, that adapter should be the preview transport authority for play, pause, seeking, playback speed, and audio monitoring; the native video element should act as the visual renderer synchronized to the shared **Playhead**.
- Mix-capable preview may expose each embedded audio **Media track** to the multitrack adapter through temporary playable audio sources derived from the source media; those preview resources are adapter-owned and must be disposed with the active **Media asset**.
- Temporary audio sources should preserve the source track's encoded audio when it can be remuxed into a reliable browser-playable source; decoded fallback sources are used only when the encoded path is unavailable or unreliable.
- Temporary audio source preparation should prepare every audio **Media track** for consistent mix-capable preview, even when some tracks are currently excluded by **Audio mix decisions**.
- While temporary audio sources are being prepared for mix-capable preview, video may be visually previewable but audio monitoring controls should remain unavailable and native video audio should not be used as a temporary substitute.
- If temporary audio source preparation fails for a **Media track**, audio monitoring should not silently omit that track; the failed track should expose a retry action that regenerates only that track's temporary preview audio source.
- In mix-capable preview mode, the native video element should be muted so all audible preview output comes from the multitrack audio path.
- In mix-capable preview mode, the multitrack audio clock is authoritative; if native video playback drifts from the shared **Playhead**, video should be corrected toward the multitrack time.
- **Playback speed** applies to the whole preview; in mix-capable preview mode, the multitrack audio transport and synchronized video renderer should use the same speed value or explicitly reject unsupported speed values.
- For video-only media, the native video element may remain the preview transport authority.
- **Output settings** are **Editing decisions** even when the UI only supports default output.
- The **Default output profile** prefers MP4 with H.264 video and AAC audio when the current **Runtime capability** supports it; browser-friendly alternatives such as WebM are fallbacks.
- Under the **Default output profile**, included audio tracks are mixed into one generated AAC audio track; preserving separate audio tracks is a future advanced export behavior.
- If all audio tracks are excluded by **Audio mix decisions**, export remains valid and produces generated media with no audio track.
- The first-slice **Default output profile** does not include a user-defined target bitrate; source bitrate may only be used as an export-runner hint if the runtime needs one.
- Custom **Output settings** such as target bitrate are future options and may require re-encoding the selected media.
- A **Waveform** may be derived from a **Media track**, but it is not the track and is not required for readiness or export.
- The first slice should load per-track **Waveform lanes** progressively for audio tracks when available because separate tracks may carry different selection context, such as desktop audio versus voice.
- A **Waveform lane** may expose minimal **Audio mix decision** controls for the same audio track, but the lane remains visual selection context rather than becoming an editable track lane.
- **Waveform lane** audio controls should be compact and colocated with track identity in the lane header, so track contribution decisions stay visually tied to the waveform they affect.
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
- **Runtime capability** determines which import, preview, analysis, and export paths are available; it does not create a separate editor model.
- **Export capability** is checked before an **Export job** starts and should expose the planned export strategy, expected precision, and user-facing reason.
- If the default output profile is unavailable for the active asset and runtime, the asset does not enter the ready editor in the first slice.
- The first-slice **Export review** should make export strategy and precision visible without introducing custom output controls.
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
