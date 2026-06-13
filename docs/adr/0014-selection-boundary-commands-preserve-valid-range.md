# Selection boundary commands preserve a valid range

Commands that set a selection boundary from the playhead should preserve a valid non-empty selection instead of swapping boundaries. If setting the start would cross the end, the end moves minimally forward; if setting the end would cross the start, the start moves minimally backward.

**Consequences**

- Selection commands never create invalid export ranges.
- Boundary-setting behavior is predictable even when the playhead is outside the current selection.
- The UI should not silently swap start and end because that makes the user's command ambiguous.
