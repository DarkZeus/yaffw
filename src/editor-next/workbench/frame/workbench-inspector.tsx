import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ReactNode, useCallback, useState } from "react";
const workbenchInspectorTabValues = ["media", "audio", "export"] as const;
const defaultWorkbenchInspectorTabValue = "media";
const workbenchInspectorTabStorageKey = "editor-next-workbench-inspector-tab";

export type WorkbenchInspectorTabValue =
	(typeof workbenchInspectorTabValues)[number];

export function WorkbenchInspectorTabs({
	audioPanel,
	exportInspector,
	mediaAssetContext,
	activeTab,
	onTabChange,
}: {
	audioPanel: ReactNode;
	exportInspector: ReactNode;
	mediaAssetContext: ReactNode;
	activeTab: WorkbenchInspectorTabValue;
	onTabChange: (tab: WorkbenchInspectorTabValue) => void;
}) {
	return (
		<aside
			aria-label="Workbench inspector region"
			id="workbench-inspector"
			className="cinema-inspector"
		>
			<Tabs
				className="flex h-full min-h-0 flex-col gap-0"
				onValueChange={(value) => {
					if (isWorkbenchInspectorTabValue(value)) onTabChange(value);
				}}
				value={activeTab}
			>
				<div className="shrink-0">
					<TabsList
						aria-label="Workbench inspector tabs"
						className="cinema-tabs"
					>
						<WorkbenchInspectorTabTrigger value="media">
							<span>Media</span>
						</WorkbenchInspectorTabTrigger>
						<WorkbenchInspectorTabTrigger value="audio">
							<span>Audio</span>
						</WorkbenchInspectorTabTrigger>
						<WorkbenchInspectorTabTrigger value="export">
							<span>Export</span>
						</WorkbenchInspectorTabTrigger>
					</TabsList>
				</div>
				<TabsContent className="cinema-tab-content" value="media">
					{mediaAssetContext}
				</TabsContent>
				<TabsContent className="cinema-tab-content" value="audio">
					{audioPanel}
				</TabsContent>
				<TabsContent className="cinema-tab-content" value="export">
					{exportInspector}
				</TabsContent>
			</Tabs>
		</aside>
	);
}

function readStoredWorkbenchInspectorTabValue(): WorkbenchInspectorTabValue {
	if (typeof window === "undefined") {
		return defaultWorkbenchInspectorTabValue;
	}

	try {
		const storedValue = window.localStorage.getItem(
			workbenchInspectorTabStorageKey,
		);

		return isWorkbenchInspectorTabValue(storedValue)
			? storedValue
			: defaultWorkbenchInspectorTabValue;
	} catch {
		return defaultWorkbenchInspectorTabValue;
	}
}

function writeStoredWorkbenchInspectorTabValue(
	value: WorkbenchInspectorTabValue,
) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(workbenchInspectorTabStorageKey, value);
	} catch {
		// Ignore storage failures so tab navigation remains usable.
	}
}

function isWorkbenchInspectorTabValue(
	value: unknown,
): value is WorkbenchInspectorTabValue {
	return (
		typeof value === "string" &&
		workbenchInspectorTabValues.includes(value as WorkbenchInspectorTabValue)
	);
}

function WorkbenchInspectorTabTrigger({
	children,
	value,
}: {
	children: ReactNode;
	value: string;
}) {
	return (
		<TabsTrigger className="cinema-tab" value={value}>
			{children}
		</TabsTrigger>
	);
}

// Tab choice is a UI preference, not editing-session state.
export function useWorkbenchInspector() {
	const [activeTab, setActiveTab] = useState<WorkbenchInspectorTabValue>(
		readStoredWorkbenchInspectorTabValue,
	);
	const selectTab = useCallback((tab: WorkbenchInspectorTabValue) => {
		setActiveTab(tab);
		writeStoredWorkbenchInspectorTabValue(tab);
	}, []);
	return { activeTab, selectTab };
}
