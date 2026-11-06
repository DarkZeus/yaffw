import {
	type ReactNode,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	Separator,
	type TabNode,
	type TabRenderProps,
	Workspace,
	useWorkspaceRef,
} from "react-resizable-panels";

import {
	type WorkbenchInspectorPanels,
	type WorkbenchPanelId,
	createNarrowWorkbenchLayout,
	readWorkbenchLayout,
	saveWorkbenchLayout,
	workbenchTabsets,
} from "./workbench-layout-model";

import {
	WorkbenchPanel,
	WorkbenchPanelsProvider,
	WorkbenchTab,
} from "./workbench-panel";

const narrowQuery = "(max-width: 760px)";
function isNarrow() {
	return window.matchMedia(narrowQuery).matches;
}
function subscribeToViewport(listener: () => void) {
	const media = window.matchMedia(narrowQuery);
	media.addEventListener("change", listener);
	return () => media.removeEventListener("change", listener);
}

const workspaceClasses = {
	tabset: "workbench-tabset",
	header: "workbench-tabset-header",
	tabList: "workbench-tab-list",
	tab: "workbench-panel-tab",
	tabPanels: "workbench-tab-panels",
	tabContent: "workbench-panel-content",
	dropIndicator: "workbench-drop-indicator",
	dragPreview: "workbench-drag-preview",
};

/** Workspace owns placement; preview and editing state stay with their adapters. */
export function EditorWorkbenchLayout({
	viewer,
	transport,
	selection,
	inspector,
}: {
	viewer: ReactNode;
	transport: ReactNode;
	selection: ReactNode;
	inspector?: WorkbenchInspectorPanels;
}) {
	const narrow = useSyncExternalStore(
		subscribeToViewport,
		isNarrow,
		() => false,
	);
	const workspaceRef = useWorkspaceRef<null>();
	const [desktopModel] = useState(() => readWorkbenchLayout(!!inspector));
	const savedDesktop = useRef(desktopModel);
	const previousNarrow = useRef(narrow);
	const mode = useRef(narrow);
	mode.current = narrow;
	const [initialModel] = useState(() =>
		narrow
			? createNarrowWorkbenchLayout(!!inspector, desktopModel)
			: desktopModel,
	);
	const panels = useMemo(
		() => ({ preview: viewer, transport, selection, ...inspector }),
		[viewer, transport, selection, inspector],
	);

	useLayoutEffect(() => {
		if (previousNarrow.current === narrow) return;
		previousNarrow.current = narrow;
		// setModel moves the existing portals; switching viewport never remounts media.
		workspaceRef.current?.setModel(
			narrow
				? createNarrowWorkbenchLayout(!!inspector, savedDesktop.current)
				: savedDesktop.current,
		);
	}, [narrow, inspector, workspaceRef]);

	return (
		<WorkbenchPanelsProvider panels={panels} disabled={narrow}>
			<Workspace
				aria-label="Editor workbench layout"
				className="workbench-workspace"
				classNames={workspaceClasses}
				defaultModel={initialModel}
				disabled={narrow}
				hiddenTabBehavior="keep-mounted"
				onModelChanged={(model, meta) => {
					if (mode.current) {
						// Save narrow-screen tab choices without replacing desktop placement.
						if (meta.reason !== "select") return;
						const selectedId = workbenchTabsets(model.root).find(
							(group) => group.id === "narrow-inspector",
						)?.selectedId;
						if (!selectedId) return;
						const desktop = structuredClone(savedDesktop.current);
						const group = workbenchTabsets(desktop.root).find((group) =>
							group.tabs.some((tab) => tab.id === selectedId),
						);
						if (group) group.selectedId = selectedId;
						savedDesktop.current = desktop;
						saveWorkbenchLayout(desktop);
						return;
					}
					savedDesktop.current = model;
					saveWorkbenchLayout(model);
				}}
				renderSeparator={renderSeparator}
				renderTab={renderTab}
				renderTabContent={renderTabContent}
				tabsetMinHeight="48px"
				tabsetMinWidth="200px"
				workspaceRef={workspaceRef}
			/>
		</WorkbenchPanelsProvider>
	);
}

function renderTabContent(tab: TabNode<null>) {
	return <WorkbenchPanel id={tab.id as WorkbenchPanelId} />;
}
function renderTab(tab: TabNode<null>, props: TabRenderProps) {
	return <WorkbenchTab tab={tab} tabProps={props} />;
}
function renderSeparator() {
	return <Separator className="workbench-panel-separator" />;
}
