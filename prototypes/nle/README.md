# Resizable NLE timeline prototype

The scope is replacing the current linear timeline with an NLE timeline. The app shell is preserved: the production `EditorWorkbenchLayout`, `PreviewTransportRegion`, `WorkbenchInspectorTabs`, `MediaAssetContextPanel`, `AudioPanel`, and `ExportInspectorPanel` are imported directly, with the production CSS. No production files are modified. A small preview adapter renders the prototype sequence in the existing viewer position.

There is one prototype. Drag a track's bottom border in the sidebar to resize only that track between 28 and 180 pixels. Short tracks show compact labels and inline controls; medium tracks show normal thumbnails and waveforms; tall tracks reveal more visual detail. Selection does not change track height. Double-click the border to restore the default. Focus a border and use Up/Down (Shift for larger steps), Home/End for limits, or Escape to cancel an active drag. Track heights are session-local display state, independent of editing history.

Run `npx vite --config prototypes/nle/vite.config.ts` from the repository root. Open [the prototype](http://127.0.0.1:3001/). The existing layout resizers remain available. The variant picker and its shortcuts have been removed.

The redesigned timeline separates sequence actions from grouped editing tools, aligns track names and controls, gives clip labels their own solid strip above thumbnails and waveforms, and uses a gap to distinguish picture from audio tracks. Edit feedback stays in a fixed footer. On narrow screens the timeline scrolls horizontally instead of shrinking clip content. The timeline inherits production workbench tokens directly. Its toolbar uses the production Button component and transport button classes; typography and neutral toggle states match the surrounding app. Clip selection and the playhead retain the production semantic colors.

All additions live in the timeline: Add clips opens a media chooser, Title adds a title clip, and Clip properties opens an editing dialog. The common model supports multiple assets; independent video/audio tracks; linked selection; cross-track dragging; insert/overwrite; splitting; normal/ripple deletion; snapping; markers; locking; visibility; mute/solo; undo/redo; and JSON sequence downloads. Existing transport controls drive sequence playback, volume, frame stepping, speed, and looping.

The outer panels provide existing-app context, not a proposed redesign. They use fixture metadata, and the production single-asset export UI is explicitly unavailable for this prototype sequence. No production NLE export engine, persistent projects, or production audio-channel processing is introduced here.

Media samples and thumbnails are local derivatives of the repository's S.T.A.L.K.E.R. Patch 1.5 video; the score is locally synthesized. Sample waveform peaks are real. Imported files use native browser decoding and remain local.

Checks:

```sh
npx biome check --config-path prototypes/nle prototypes/nle/*.ts prototypes/nle/*.tsx prototypes/nle/*.css
npx tsc -p prototypes/nle/tsconfig.json
npx vitest run --config prototypes/nle/vite.config.ts
npx vite build --config prototypes/nle/vite.config.ts
```

Twenty-three tests cover sequence renaming/export, inline track renaming, cancellation, blank-name rejection, rename undo/redo, bottom-edge handle availability (including newly added tracks), keyboard steps and limits, drag cancellation/completion, and sequence movement, locks, linked splitting, insert/overwrite remainders, source limits, and ripple behavior. The isolated Vite config includes the production styling pipeline but omits production router generation and upload cleanup. Output stays in ignored `dist/`.

## Timeline controls

The selected toolbar, thumbnail, marker, and footer changes now form one prototype at http://127.0.0.1:3001/. The comparison picker is removed. Track controls keep their original always-visible behavior.

Click Add track to replace it in place with two equal-width icon buttons: audio on the left, video on the right. The control stays the same size. Mouse exit returns to Add track; keyboard users can tab between choices, with Escape returning focus to the trigger. Both buttons create real prototype tracks.

The prototype has one entry point (`app.tsx`), one toolbar/footer implementation (`timeline-controls.tsx`), and a dedicated bottom-edge resize component (`track-resize-handle.tsx`). Retired variant flags, alternate controls, source monitor, mixer, and positioning overlays are removed. Video uses muted blue, audio sage, and titles lavender; selection stays gold. Add track choices use tinted backgrounds with neutral icons.

Double-click a track name to rename it inline (keyboard: Enter or F2). Enter or clicking away saves; Escape cancels. Blank names are discarded, and renaming participates in undo/redo.

Double-click the sequence name in the toolbar to rename it with the same inline editing controls. The name is part of sequence history and saved JSON. The arrow beside the name opens Rename and Save sequence.

All authored colors use OKLCH, following the root `AGENTS.md` color rule. The native title color picker converts at its input/output boundary using Culori; sequence state and saved colors remain OKLCH. A regression test covers picker editing and undo.
