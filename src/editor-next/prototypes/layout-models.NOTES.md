# PROTOTYPE - Workbench layout models

Question: should YAFFW's customizable workbench follow fixed Photoshop/Premiere-style dock targets, occupied dock groups with no empty slots, or a Blender-style area/editor model?

Run:

```sh
pnpm run prototype:layout-models
```

Open `/editor-layout-prototype` and switch variants with the bottom bar or left/right arrow keys:

- `dock`: Photoshop/Premiere-style panel tabs and dock targets
- `groups`: Photoshop/Premiere-style panel tabs on an occupied split tree; no predeclared slots and no empty groups
- `area`: Blender-style split areas with selectable editor types

Interactions:

- `dock`: click tabs to activate hidden panels without reordering them, pointer-drag panel tabs between dock targets after a short movement threshold, drag the `Try it` helper by its title strip, or use the click fallback to pick a panel and send it to a target
- `groups`: click tabs to activate hidden panels, drag a tab onto another group's center to make a tab group, drag onto a group's edge to create a new occupied split, and miss all groups to return the tab
- `area`: drag an editor header grip onto another area to swap editors, drag split handles to resize boundaries, select an area, switch its editor type, split it left/right or top/bottom, join the selected area into the sibling side named in the join preview, or reset the layout

Delete or absorb this prototype after the layout model decision is validated.

## Verdict

Pending.
