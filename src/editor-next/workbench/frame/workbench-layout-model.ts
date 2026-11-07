import type { ReactNode } from "react";
import {
	type TabNode,
	type TabsetNode,
	type WorkspaceModel,
	type WorkspaceNode,
	normalizeWorkspaceModel,
} from "react-resizable-panels";

export type WorkbenchInspectorPanels = {
	media: ReactNode;
	audio: ReactNode;
	export: ReactNode;
};

export const workbenchPanelTitles = {
	preview: "Preview",
	transport: "Transport",
	selection: "Selection",
	media: "Media",
	audio: "Audio",
	export: "Export",
} as const;
export type WorkbenchPanelId = keyof typeof workbenchPanelTitles;
type WorkbenchInspectorTab = keyof WorkbenchInspectorPanels;
export type WorkbenchLayoutModel = WorkspaceModel<null>;
type SavedWorkbenchLayout = WorkbenchLayoutModel & {
	narrowInspectorTab?: WorkbenchInspectorTab;
};
export const workbenchLayoutStorageKey = "yaffw-workbench-layout-v1";

export function isWorkbenchInspectorTab(
	id: unknown,
): id is WorkbenchInspectorTab {
	return id === "media" || id === "audio" || id === "export";
}

function panel(id: WorkbenchPanelId): TabNode<null> {
	return {
		id,
		title: workbenchPanelTitles[id],
		data: null,
		disableClose: true,
	};
}

function tabset(
	id: string,
	panels: WorkbenchPanelId[],
	options: Partial<TabsetNode<null>> = {},
): TabsetNode<null> {
	return { type: "tabset", id, tabs: panels.map(panel), ...options };
}

export function createDefaultWorkbenchLayout(
	withInspector = true,
): WorkbenchLayoutModel {
	return {
		version: 1,
		root: {
			type: "split",
			id: "cinema",
			orientation: "vertical",
			children: [
				{
					type: "split",
					id: "cinema-top",
					orientation: "horizontal",
					size: 70,
					children: [
						{
							type: "split",
							id: "cinema-preview",
							orientation: "vertical",
							size: withInspector ? 74 : 100,
							children: [
								tabset("viewer", ["preview"], { size: 85, minHeight: "120px" }),
								tabset("dock-transport", ["transport"], {
									size: 15,
									minHeight: "52px",
									maxHeight: "64px",
								}),
							],
						},
						...(withInspector
							? [
									tabset("inspector", ["media", "audio", "export"], {
										size: 26,
									}),
								]
							: []),
					],
				},
				tabset("dock-selection", ["selection"], {
					size: 30,
					minHeight: "140px",
				}),
			],
		},
	};
}

export function createNarrowWorkbenchLayout(
	withInspector = true,
	desktopModel: SavedWorkbenchLayout = createDefaultWorkbenchLayout(
		withInspector,
	),
): WorkbenchLayoutModel {
	const selectedId =
		desktopModel.narrowInspectorTab ??
		workbenchTabsets(desktopModel.root)
			.map((group) => group.selectedId)
			.find(isWorkbenchInspectorTab);
	return {
		version: 1,
		root: {
			type: "split",
			id: "narrow",
			orientation: "vertical",
			children: [
				tabset("narrow-preview", ["preview"]),
				tabset("narrow-transport", ["transport"]),
				tabset("narrow-selection", ["selection"]),
				...(withInspector
					? [
							tabset("narrow-inspector", ["media", "audio", "export"], {
								selectedId,
							}),
						]
					: []),
			],
		},
	};
}

export function rememberNarrowInspectorTab(
	desktopModel: SavedWorkbenchLayout,
	narrowModel: WorkbenchLayoutModel,
): SavedWorkbenchLayout | null {
	const selectedId = workbenchTabsets(narrowModel.root).find(
		(group) => group.id === "narrow-inspector",
	)?.selectedId;
	if (!isWorkbenchInspectorTab(selectedId)) return null;
	const desktop = structuredClone(desktopModel);
	const group = workbenchTabsets(desktop.root).find((group) =>
		group.tabs.some((tab) => tab.id === selectedId),
	);
	if (group) group.selectedId = selectedId;
	desktop.narrowInspectorTab = selectedId;
	return desktop;
}

export function workbenchTabsets(
	node: WorkspaceNode<null>,
): TabsetNode<null>[] {
	return node.type === "tabset"
		? [node]
		: node.children.flatMap(workbenchTabsets);
}

export function restoreWorkbenchLayout(
	value: unknown,
	withInspector = true,
): WorkbenchLayoutModel | null {
	const available = new Set(
		workbenchTabsets(createDefaultWorkbenchLayout(withInspector).root).flatMap(
			(node) => node.tabs.map((tab) => tab.id),
		),
	);
	const model = normalizeWorkspaceModel<null>(value, {
		mapTab: (tab) =>
			available.has(tab.id) ? panel(tab.id as WorkbenchPanelId) : null,
	});
	if (!model) return null;

	// Recover older layouts without trusting saved titles, flags, or panel data.
	const tabsets = workbenchTabsets(model.root);
	const present = new Set(
		tabsets.flatMap((node) => node.tabs.map((tab) => tab.id)),
	);
	const missing = [...available].filter((id) => !present.has(id));
	const unfilled = tabsets.filter((node) => node.tabs.length === 0);
	const targets = unfilled.length ? unfilled : tabsets;
	for (const [index, id] of missing.entries()) {
		targets[index % targets.length].tabs.push(panel(id as WorkbenchPanelId));
	}
	return normalizeWorkspaceModel<null>(model);
}

export function readWorkbenchLayout(
	withInspector = true,
): SavedWorkbenchLayout {
	try {
		const stored = localStorage.getItem(workbenchLayoutStorageKey);
		if (stored) {
			const value: unknown = JSON.parse(stored);
			const model: SavedWorkbenchLayout | null = restoreWorkbenchLayout(
				value,
				withInspector,
			);
			if (model) {
				if (
					withInspector &&
					value &&
					typeof value === "object" &&
					"narrowInspectorTab" in value &&
					isWorkbenchInspectorTab(value.narrowInspectorTab)
				) {
					model.narrowInspectorTab = value.narrowInspectorTab;
				}
				return model;
			}
		}
	} catch {
		// A corrupt preference or unavailable storage must not block editing.
	}
	return createDefaultWorkbenchLayout(withInspector);
}

export function saveWorkbenchLayout(model: SavedWorkbenchLayout) {
	try {
		localStorage.setItem(workbenchLayoutStorageKey, JSON.stringify(model));
	} catch {
		// Layout customization still works when browser storage is unavailable.
	}
}
