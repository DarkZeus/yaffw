# Selection handle drag scrubs preview

Dragging a selection start or end handle should scrub the preview playhead to the boundary being edited so the user can inspect the exact frame chosen for export. Dragging the selected range body may remain local draft state and commit on pointer release without requiring continuous preview scrubbing.

**Consequences**

- Selection and playhead remain separate concepts, but handle interaction is allowed to update both during preview.
- Export still uses the committed selection, not transient drag state.
- The selection control needs separate callbacks for selection preview, selection commit, and playhead preview/seek.
