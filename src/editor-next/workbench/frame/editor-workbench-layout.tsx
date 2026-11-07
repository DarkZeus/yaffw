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
	type WorkspaceChangedMeta,
	useWorkspaceRef,
} from "react-resizable-panels";
import { useWorkspacePointer } from "./use-workspace-pointer";
import {
	type WorkbenchInspectorPanels,
	type WorkbenchLayoutModel,
	type WorkbenchPanelId,
	createNarrowWorkbenchLayout,
	isWorkbenchInspectorTab,
	readWorkbenchLayout,
	rememberNarrowInspectorTab,
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
	const viewport = narrow ? "narrow" : "desktop";
	const withInspector = !!inspector;
	const workspaceRef = useWorkspaceRef<null>();
	const workspaceElement = useRef<HTMLDivElement>(null);
	const cancelWorkspacePointer = useWorkspacePointer(workspaceElement, !narrow);
	const [initial] = useState(() => {
		const desktop = readWorkbenchLayout(withInspector);
		return {
			viewport,
			desktop,
			model: narrow
				? createNarrowWorkbenchLayout(withInspector, desktop)
				: desktop,
		};
	});
	const layout = useRef({
		viewport: initial.viewport,
		desktop: initial.desktop,
	});
	const panels = useMemo(
		() => ({ preview: viewer, transport, selection, ...inspector }),
		[viewer, transport, selection, inspector],
	);

	useLayoutEffect(() => {
		const active = layout.current;
		const workspace = workspaceRef.current;
		if (!workspace || active.viewport === viewport) return;
		if (viewport === "narrow") cancelWorkspacePointer();
		// setModel moves the existing portals; switching viewport never remounts media.
		workspace.setModel(
			viewport === "narrow"
				? createNarrowWorkbenchLayout(withInspector, active.desktop)
				: active.desktop,
		);
		active.viewport = viewport;
	}, [cancelWorkspacePointer, viewport, withInspector, workspaceRef]);

	function handleModelChange(
		model: WorkbenchLayoutModel,
		{ reason }: WorkspaceChangedMeta,
	) {
		const active = layout.current;
		// The model replacement during a viewport switch is not a layout edit.
		if (active.viewport !== viewport) return;
		if (viewport === "narrow") {
			if (reason !== "select") return;
			const desktop = rememberNarrowInspectorTab(active.desktop, model);
			if (!desktop) return;
			active.desktop = desktop;
		} else {
			let narrowInspectorTab = active.desktop.narrowInspectorTab;
			if (reason === "set-model") narrowInspectorTab = undefined;
			if (reason === "select") {
				const previousSelections = new Set(
					workbenchTabsets(active.desktop.root).map(
						(group) => group.selectedId,
					),
				);
				const selectedTab = workbenchTabsets(model.root)
					.map((group) => group.selectedId)
					.find((id) => !previousSelections.has(id));
				if (isWorkbenchInspectorTab(selectedTab))
					narrowInspectorTab = selectedTab;
			}
			active.desktop = narrowInspectorTab
				? { ...model, narrowInspectorTab }
				: model;
		}
		saveWorkbenchLayout(active.desktop);
	}

	return (
		<WorkbenchPanelsProvider panels={panels} disabled={narrow}>
			<Workspace
				aria-label="Editor workbench layout"
				className="workbench-workspace"
				classNames={workspaceClasses}
				defaultModel={initial.model}
				disableDrop={narrow}
				disabled={narrow}
				elementRef={workspaceElement}
				hiddenTabBehavior="keep-mounted"
				onModelChanged={handleModelChange}
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
