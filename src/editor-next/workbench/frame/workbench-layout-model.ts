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
export type WorkbenchLayoutModel = WorkspaceModel<null>;
export const workbenchLayoutStorageKey = "yaffw-workbench-layout-v1";

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
	desktopModel = createDefaultWorkbenchLayout(withInspector),
): WorkbenchLayoutModel {
	const selectedId = workbenchTabsets(desktopModel.root)
		.map((group) => group.selectedId)
		.find((id) => id === "media" || id === "audio" || id === "export");
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
): WorkbenchLayoutModel {
	try {
		const stored = localStorage.getItem(workbenchLayoutStorageKey);
		if (stored) {
			const model = restoreWorkbenchLayout(JSON.parse(stored), withInspector);
			if (model) return model;
		}
	} catch {
		// A corrupt preference or unavailable storage must not block editing.
	}
	return createDefaultWorkbenchLayout(withInspector);
}

export function saveWorkbenchLayout(model: WorkbenchLayoutModel) {
	try {
		localStorage.setItem(workbenchLayoutStorageKey, JSON.stringify(model));
	} catch {
		// Layout customization still works when browser storage is unavailable.
	}
}
