# Cinema editor workbench

The default **Editor workbench** uses the selected Cinema direction: a large preview with transport controls beneath it, a full-width lower selection/waveform surface, and a persistent right inspector for Media, Audio, and Export. Near-black neutral chrome leaves the media prominent, while the gold YAFFW mark, selection, and semantic status colors retain their meaning.

The Cinema arrangement replaces the earlier persistent left inspector layout. YAFFW retains its single-asset model: no bins, source monitors, clip stacks, project timeline, or multi-asset composition. The workbench does not add a persistent icon/status rail without a navigational or state-changing function.

**Consequences**

- The inspector remains visible after import. The Export tab is the entry point for export review; the header is removed while a video is loaded. The logo header remains on the import screen, and the Media tab identifies the loaded file.
- Desktop users can resize the preview/inspector boundary and the upper work area/lower selection boundary. The default lower area uses about one-third of the available editing area.
- Narrow screens stack preview, transport, selection, then the inspector. The media player stays mounted across layout changes.
- Last-tab and panel-size preferences remain browser-local UI state. They do not persist the active media asset or editing decisions.
- The selected prototype is integrated into the root editor and the exploration picker is removed.

- The first-slice card/page layout is treated as prototype scaffolding, not the long-term product shape.
- The workbench may borrow professional editor composition and density, but domain language stays centered on **Media asset**, **Selection**, **Playhead**, **Waveform lane**, **Export review**, and **Delivery action**.
- Waveform lane identity belongs inside each lane row using media-track names such as voice or desktop, not in a separate V1/A1/A2-style track console.
