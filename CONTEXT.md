# YAFFW

YAFFW is a local-first media editor for personal video editing workflows. Its core domain is preparing media assets for preview, selection, and export; acquisition from external URLs is an import path, not the product center.

## Language

**Local-first media editor**:
An editor where the user's loaded media and editing decisions are primary, and processing should happen locally when feasible.
_Avoid_: downloader, FFmpeg wrapper

**Media asset**:
A media item available to the editor as the subject of preview, selection, analysis, and export.
_Avoid_: upload, download result, server file, file path

**Media asset draft**:
An import result that can be loaded and analyzed into a media asset.
_Avoid_: API response, download response, uploaded file

**Ready media asset**:
A media asset that can be previewed and safely edited.
_Avoid_: fully analyzed asset, uploaded asset

**Import adapter**:
A mechanism that brings media from an external source into the editor as a media asset.
_Avoid_: acquisition workflow, downloader core

**Single-asset editing session**:
An editing session centered on exactly one active media asset and the user's decisions about that asset.
_Avoid_: project, composition, multi-asset timeline

**Editing decision**:
A user choice that changes the exported media produced from the active media asset.
_Avoid_: playback state, UI state, progress state

**Selection**:
The time range of the active media asset that will be exported.
_Avoid_: trim, timeline

**Playhead**:
The current preview position within the active media asset.
_Avoid_: current time, cursor

**Waveform**:
A visual representation of audio amplitude over time for a media asset or audio track.
_Avoid_: timeline

**Media track**:
A video, audio, or subtitle stream discovered inside a media asset.
_Avoid_: waveform lane, stream object

**Audio mix decision**:
A user choice that changes how an audio track contributes to exported media.
_Avoid_: waveform setting, player volume

**Export job**:
A processing run that applies editing decisions to a media asset and produces generated media.
_Avoid_: trim request, download action

**Generated media**:
Media produced by an export job.
_Avoid_: download, trimmed video

**Fallback job**:
A server-run processing job used only when local editor processing cannot satisfy an import or export need.
_Avoid_: default export, server trim

## Relationships

- YAFFW edits one active **Media asset** at a time.
- An **Import adapter** produces a **Media asset draft**; it does not own editor behavior.
- A **Media asset draft** is loaded and analyzed into a **Media asset**.
- A **Media asset** may originate from local file selection or an external URL.
- A **Ready media asset** has enough known duration and track inventory to accept editing decisions.
- Metadata, track analysis, waveform rendering, backing storage, and export jobs belong around a **Media asset**; none of them replace it as the editor's central concept.
- A **Single-asset editing session** owns the active **Media asset** and the **Editing decisions** for that asset.
- Playback position, fullscreen state, loading progress, and analysis progress are not **Editing decisions**.
- A **Selection** is an **Editing decision**; a **Playhead** is preview state.
- A timeline control may display a **Waveform**, **Playhead**, and **Selection**, but "timeline" is not a domain object in the single-asset editor.
- A **Media asset** contains zero or more **Media tracks**.
- An **Audio mix decision** is an **Editing decision** for one **Media track**.
- A **Waveform** may be derived from a **Media track**, but it is not the track and is not required for editing.
- An **Export job** consumes one **Media asset** and the session's **Editing decisions**.
- An **Export job** produces **Generated media**; saving or downloading that result is a separate delivery concern.
- **Generated media** may become a **Media asset draft** only through explicit user action.
- A **Fallback job** may support an **Import adapter** or **Export job**, but it is not the normal editing path.

## Example dialogue

> **Dev:** "If a Twitter URL requires cookies, does export logic need to know?"
> **Domain expert:** "No. The **Import adapter** either produces a **Media asset** or fails before editing begins."

## Flagged ambiguities

- "download" and "acquisition" were previously treated as core product areas. Resolved: acquisition is an **Import adapter** feeding **Media assets** into the **Local-first media editor**.
- "project" and "timeline" imply multi-asset composition. Resolved: YAFFW's next architecture is a **Single-asset editing session**; multi-asset composition is out of scope until it earns its own model.
