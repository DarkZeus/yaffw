// Throwaway prototype: interactive Photoshop/Premiere docking versus Blender area/editor layout models, switchable via ?variant=.
import {
	ArrowLeft,
	ArrowRight,
	AudioWaveform,
	CopyPlus,
	FileVideo,
	Film,
	GitBranch,
	Grip,
	LayoutGrid,
	Maximize2,
	Menu,
	MousePointer2,
	Pause,
	Play,
	RotateCcw,
	Rows3,
	Scissors,
	Settings2,
	SlidersHorizontal,
	SplitSquareHorizontal,
	SplitSquareVertical,
	Volume2,
} from "lucide-react";
import type {
	ComponentType,
	MouseEvent as ReactMouseEvent,
	ReactNode,
} from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type VariantKey = "dock" | "groups" | "area";

type Variant = {
	key: VariantKey;
	name: string;
};

type PanelId = "media" | "preview" | "transport" | "waveform" | "export";

type PanelDefinition = {
	accentIconClassName: string;
	id: PanelId;
	icon: ComponentType<{ className?: string }>;
	label: string;
	shortLabel: string;
};

type DockTargetId = "left" | "center" | "right" | "strip" | "bottom";

type DockTargetState = {
	activePanel: PanelId | null;
	id: DockTargetId;
	label: string;
	panels: PanelId[];
};

type DockDragState = {
	panelId: PanelId;
	pointerX: number;
	pointerY: number;
};

type DockGroupDropZone = "center" | "left" | "right" | "top" | "bottom";

type DockGroupDragState = DockDragState & {
	overGroupId: string | null;
	sourceGroupId: string;
	zone: DockGroupDropZone | null;
};

type DockGroupNode =
	| {
			activePanel: PanelId;
			flex?: number;
			id: string;
			kind: "group";
			panels: PanelId[];
	  }
	| {
			children: [DockGroupNode, DockGroupNode];
			direction: "row" | "column";
			flex?: number;
			id: string;
			kind: "split";
	  };

type FloatingPosition = {
	x: number;
	y: number;
};

type AreaNode =
	| {
			editor: PanelId;
			flex?: number;
			id: string;
			kind: "leaf";
	  }
	| {
			children: [AreaNode, AreaNode];
			direction: "row" | "column";
			flex?: number;
			id: string;
			kind: "split";
	  };

type AreaJoinPreview = {
	direction: "row" | "column";
	selectedId: string;
	siblingId: string;
	siblingEditor: PanelId;
};

type AreaEditorDragState = {
	editor: PanelId;
	pointerX: number;
	pointerY: number;
	sourceAreaId: string;
};

const variants: Variant[] = [
	{ key: "dock", name: "Photoshop/Premiere docking" },
	{ key: "groups", name: "Dock groups / no empty slots" },
	{ key: "area", name: "Blender areas/editors" },
];

const panelOrder: PanelId[] = [
	"media",
	"preview",
	"transport",
	"waveform",
	"export",
];

const panelDefinitions: Record<PanelId, PanelDefinition> = {
	media: {
		accentIconClassName: "text-[#f2b84b]",
		icon: FileVideo,
		id: "media",
		label: "Media asset context",
		shortLabel: "Media",
	},
	preview: {
		accentIconClassName: "text-[#74d7ff]",
		icon: Film,
		id: "preview",
		label: "Preview viewer",
		shortLabel: "Viewer",
	},
	transport: {
		accentIconClassName: "text-[#f07d55]",
		icon: SlidersHorizontal,
		id: "transport",
		label: "Preview transport",
		shortLabel: "Transport",
	},
	waveform: {
		accentIconClassName: "text-[#9ee37d]",
		icon: AudioWaveform,
		id: "waveform",
		label: "Selection/Waveform",
		shortLabel: "Waveform",
	},
	export: {
		accentIconClassName: "text-[#d7a8ff]",
		icon: CopyPlus,
		id: "export",
		label: "Export inspector",
		shortLabel: "Export",
	},
};

const defaultDockTargets: DockTargetState[] = [
	{
		activePanel: "media",
		id: "left",
		label: "Left dock target",
		panels: ["media"],
	},
	{
		activePanel: "preview",
		id: "center",
		label: "Preview dock target",
		panels: ["preview"],
	},
	{
		activePanel: "transport",
		id: "strip",
		label: "Transport strip target",
		panels: ["transport"],
	},
	{
		activePanel: "waveform",
		id: "bottom",
		label: "Waveform target",
		panels: ["waveform"],
	},
	{
		activePanel: "export",
		id: "right",
		label: "Right inspector target",
		panels: ["export"],
	},
];

const defaultDockGroupTree: DockGroupNode = {
	children: [
		{
			activePanel: "media",
			flex: 0.22,
			id: "group-media",
			kind: "group",
			panels: ["media"],
		},
		{
			children: [
				{
					children: [
						{
							children: [
								{
									activePanel: "preview",
									flex: 0.84,
									id: "group-preview",
									kind: "group",
									panels: ["preview"],
								},
								{
									activePanel: "transport",
									flex: 0.16,
									id: "group-transport",
									kind: "group",
									panels: ["transport"],
								},
							],
							direction: "column",
							flex: 0.68,
							id: "dock-groups-split-preview-transport",
							kind: "split",
						},
						{
							activePanel: "waveform",
							flex: 0.32,
							id: "group-waveform",
							kind: "group",
							panels: ["waveform"],
						},
					],
					direction: "column",
					flex: 0.72,
					id: "dock-groups-split-center",
					kind: "split",
				},
				{
					activePanel: "export",
					flex: 0.28,
					id: "group-export",
					kind: "group",
					panels: ["export"],
				},
			],
			direction: "row",
			flex: 0.78,
			id: "dock-groups-split-rest",
			kind: "split",
		},
	],
	direction: "row",
	id: "dock-groups-root",
	kind: "split",
};

const defaultAreaTree: AreaNode = {
	children: [
		{ editor: "media", flex: 0.22, id: "area-1", kind: "leaf" },
		{
			children: [
				{
					children: [
						{
							children: [
								{ editor: "preview", flex: 1, id: "area-2", kind: "leaf" },
								{
									editor: "transport",
									flex: 0.16,
									id: "area-4",
									kind: "leaf",
								},
							],
							direction: "column",
							flex: 0.72,
							id: "split-center-controls",
							kind: "split",
						},
						{ editor: "waveform", flex: 0.38, id: "area-5", kind: "leaf" },
					],
					direction: "column",
					flex: 1,
					id: "split-center-waveform",
					kind: "split",
				},
				{ editor: "export", flex: 0.28, id: "area-3", kind: "leaf" },
			],
			direction: "row",
			flex: 0.78,
			id: "split-main-rest",
			kind: "split",
		},
	],
	direction: "row",
	id: "split-root",
	kind: "split",
};

const prototypeState = {
	asset: "stalker-patch-1.5-teaser.mp4",
	defaultLayout:
		"Left media, center viewer, transport strip, bottom waveform, right export",
	export: "MP4 / H.264 / AAC / best-effort precision",
	playhead: "00:04.280 / 00:13.500",
	selection: "00:02.440 -> 00:09.860",
};

const frameImage = "/editor-workbench-prototype-frame.jpg";

export function WorkbenchLayoutModelPrototype() {
	const [variantKey, setVariantKey] = useState<VariantKey>(() =>
		readVariantFromUrl(),
	);
	const activeVariant = useMemo(
		() => variants.find((variant) => variant.key === variantKey) ?? variants[0],
		[variantKey],
	);

	const setVariant = useCallback((nextVariant: VariantKey) => {
		const searchParams = new URLSearchParams(window.location.search);
		searchParams.set("variant", nextVariant);
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}?${searchParams.toString()}`,
		);
		setVariantKey(nextVariant);
	}, []);

	const cycleVariant = useCallback(
		(direction: -1 | 1) => {
			const currentIndex = variants.findIndex(
				(variant) => variant.key === variantKey,
			);
			const nextIndex =
				(currentIndex + direction + variants.length) % variants.length;
			setVariant(variants[nextIndex].key);
		},
		[setVariant, variantKey],
	);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			const target = event.target;
			const isTyping =
				target instanceof HTMLElement &&
				(target.tagName === "INPUT" ||
					target.tagName === "SELECT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);

			if (isTyping) {
				return;
			}

			if (event.key === "ArrowLeft") {
				event.preventDefault();
				cycleVariant(-1);
			}

			if (event.key === "ArrowRight") {
				event.preventDefault();
				cycleVariant(1);
			}
		}

		window.addEventListener("keydown", handleKeyDown);

		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [cycleVariant]);

	return (
		<main className="h-screen min-h-0 overflow-hidden bg-[#11100d] text-[#f2eadb]">
			<style>
				{`
					[data-slot="sidebar"],
					[data-sidebar="rail"],
					[data-sidebar="trigger"] {
						display: none !important;
					}
				`}
			</style>
			{variantKey === "dock" ? <PhotoshopPremiereDocking /> : null}
			{variantKey === "groups" ? <DockGroupsNoEmptySlots /> : null}
			{variantKey === "area" ? <BlenderAreaEditors /> : null}
			<PrototypeSwitcher
				current={activeVariant}
				onNext={() => cycleVariant(1)}
				onPrevious={() => cycleVariant(-1)}
			/>
		</main>
	);
}

function PhotoshopPremiereDocking() {
	const [dockTargets, setDockTargets] = useState<DockTargetState[]>(() =>
		cloneDockTargets(defaultDockTargets),
	);
	const [dragState, setDragState] = useState<DockDragState | null>(null);
	const [pickedPanel, setPickedPanel] = useState<PanelId | null>("export");
	const [lastDockAction, setLastDockAction] = useState(
		"Drag a tab, or pick a panel and send it to a target.",
	);
	const draggedPanel = dragState?.panelId ?? null;

	const movePanel = useCallback((panelId: PanelId, targetId: DockTargetId) => {
		setDockTargets((currentTargets) =>
			currentTargets.map((target) => {
				const panelsWithoutMoved = target.panels.filter(
					(candidatePanelId) => candidatePanelId !== panelId,
				);

				if (target.id === targetId) {
					const panels = [...panelsWithoutMoved, panelId];
					return {
						...target,
						activePanel: panelId,
						panels,
					};
				}

				return {
					...target,
					activePanel:
						target.activePanel === panelId
							? (panelsWithoutMoved[0] ?? null)
							: target.activePanel,
					panels: panelsWithoutMoved,
				};
			}),
		);
		setLastDockAction(
			`${panelDefinitions[panelId].label} moved to ${targetId}.`,
		);
	}, []);

	function resetDockLayout() {
		setDockTargets(cloneDockTargets(defaultDockTargets));
		setDragState(null);
		setPickedPanel("export");
		setLastDockAction("Reset to the current coded default layout.");
	}

	function sendPickedPanelToTarget(targetId: DockTargetId) {
		if (!pickedPanel) {
			setLastDockAction("Pick a panel before sending it to a target.");
			return;
		}

		movePanel(pickedPanel, targetId);
	}

	function startPanelTabInteraction(
		panelId: PanelId,
		sourceTargetId: DockTargetId,
		event: ReactMouseEvent<HTMLButtonElement>,
	) {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		let dragStarted = false;

		function startDragging(pointerX: number, pointerY: number) {
			if (dragStarted) {
				return;
			}

			dragStarted = true;
			setPickedPanel(panelId);
			setDragState({ panelId, pointerX, pointerY });
			setLastDockAction(
				`Dragging ${panelDefinitions[panelId].label}; release over a dock target.`,
			);
		}

		function handleMouseMove(moveEvent: MouseEvent) {
			const pointerDistance = Math.hypot(
				moveEvent.clientX - startX,
				moveEvent.clientY - startY,
			);

			if (pointerDistance >= 6) {
				startDragging(moveEvent.clientX, moveEvent.clientY);
			}

			if (dragStarted) {
				setDragState({
					panelId,
					pointerX: moveEvent.clientX,
					pointerY: moveEvent.clientY,
				});
			}
		}

		function handleMouseUp(upEvent: MouseEvent) {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);

			if (!dragStarted) {
				activatePanel(panelId, sourceTargetId);
				return;
			}

			const targetElement = document
				.elementFromPoint(upEvent.clientX, upEvent.clientY)
				?.closest<HTMLElement>("[data-dock-target-id]");
			const targetId = targetElement?.dataset.dockTargetId as
				| DockTargetId
				| undefined;

			if (targetId) {
				movePanel(panelId, targetId);
			} else {
				setLastDockAction(
					`${panelDefinitions[panelId].label} returned; no dock target under pointer.`,
				);
			}

			setDragState(null);
		}

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp, { once: true });
	}

	function activatePanel(panelId: PanelId, targetId: DockTargetId) {
		setDockTargets((currentTargets) =>
			currentTargets.map((target) =>
				target.id === targetId ? { ...target, activePanel: panelId } : target,
			),
		);
		setLastDockAction(`${panelDefinitions[panelId].label} tab activated.`);
	}

	return (
		<section className="grid h-full grid-rows-[40px_minmax(0,1fr)] bg-[#0f1112]">
			<TopChrome
				leadingIcon={<LayoutGrid className="size-4" />}
				subtitle="Drag tabs between dock targets, click tabs to reveal hidden panels"
				title="Photoshop/Premiere model"
			/>
			<div className="relative grid min-h-0 grid-cols-[48px_272px_minmax(0,1fr)_328px] grid-rows-[minmax(0,1fr)_54px_32%] border-t border-[#34302a]">
				<DockRail dockTargets={dockTargets} />
				<DockTargetFrame
					className="col-start-2 row-span-3 border-r border-[#34302a]"
					draggedPanel={draggedPanel}
					onActivatePanel={activatePanel}
					onTabInteractionStarted={startPanelTabInteraction}
					state={dockTargetById(dockTargets, "left")}
				/>
				<DockTargetFrame
					className="col-start-3 row-start-1 border-r border-[#34302a]"
					draggedPanel={draggedPanel}
					onActivatePanel={activatePanel}
					onTabInteractionStarted={startPanelTabInteraction}
					state={dockTargetById(dockTargets, "center")}
				/>
				<DockTargetFrame
					className="col-start-4 row-span-3"
					draggedPanel={draggedPanel}
					onActivatePanel={activatePanel}
					onTabInteractionStarted={startPanelTabInteraction}
					state={dockTargetById(dockTargets, "right")}
				/>
				<DockTargetFrame
					className="col-start-3 row-start-2 border-r border-t border-[#34302a]"
					draggedPanel={draggedPanel}
					onActivatePanel={activatePanel}
					onTabInteractionStarted={startPanelTabInteraction}
					state={dockTargetById(dockTargets, "strip")}
				/>
				<DockTargetFrame
					className="col-start-3 row-start-3 border-r border-t border-[#34302a]"
					draggedPanel={draggedPanel}
					onActivatePanel={activatePanel}
					onTabInteractionStarted={startPanelTabInteraction}
					state={dockTargetById(dockTargets, "bottom")}
				/>
				<DockInstructions
					draggedPanel={draggedPanel}
					onPanelPicked={setPickedPanel}
					lastAction={lastDockAction}
					onReset={resetDockLayout}
					onTargetPicked={sendPickedPanelToTarget}
					pickedPanel={pickedPanel}
				/>
				{dragState ? <DockDragPreview dragState={dragState} /> : null}
				<VariantStateOverlay
					state={{
						activeDrag: draggedPanel,
						dockTargets,
						lastAction: lastDockAction,
						model: "panel docking",
						moveUnit: "workbench panel tab",
						pickedPanel,
						stateShape: "dockTargets -> activePanel + panelIds",
					}}
					title="Docking state"
					variantName="Photoshop/Premiere docking"
				/>
			</div>
		</section>
	);
}

function DockGroupsNoEmptySlots() {
	const [layoutTree, setLayoutTree] = useState<DockGroupNode>(() =>
		cloneDockGroupNode(defaultDockGroupTree),
	);
	const [dragState, setDragState] = useState<DockGroupDragState | null>(null);
	const [lastAction, setLastAction] = useState(
		"Drag a tab onto a group center to tab it, or onto an edge to split.",
	);
	const groupCount = collectDockGroups(layoutTree).length;

	function resetLayout() {
		setLayoutTree(cloneDockGroupNode(defaultDockGroupTree));
		setDragState(null);
		setLastAction("Reset to occupied dock groups. No empty slots exist.");
	}

	function activatePanel(panelId: PanelId, groupId: string) {
		setLayoutTree((currentTree) =>
			updateDockGroup(currentTree, groupId, (group) => ({
				...group,
				activePanel: panelId,
			})),
		);
		setLastAction(
			`${panelDefinitions[panelId].label} activated in ${groupId}.`,
		);
	}

	function movePanelToGroupDrop(
		panelId: PanelId,
		sourceGroupId: string,
		targetGroupId: string,
		zone: DockGroupDropZone,
	) {
		const actionLabel =
			sourceGroupId === targetGroupId && zone === "center"
				? `${panelDefinitions[panelId].label} stayed in ${targetGroupId}.`
				: zone === "center"
					? `${panelDefinitions[panelId].label} tabbed into ${targetGroupId}.`
					: `${panelDefinitions[panelId].label} split ${zone} of ${targetGroupId}.`;

		setLayoutTree((currentTree) => {
			const sourceGroup = findDockGroup(currentTree, sourceGroupId);
			const targetGroup = findDockGroup(currentTree, targetGroupId);

			if (
				!sourceGroup ||
				!targetGroup ||
				!sourceGroup.panels.includes(panelId)
			) {
				return currentTree;
			}

			if (sourceGroupId === targetGroupId && zone === "center") {
				return updateDockGroup(currentTree, targetGroupId, (group) => ({
					...group,
					activePanel: panelId,
				}));
			}

			const removalResult = removePanelFromDockGroupTree(currentTree, panelId);

			if (!removalResult.node) {
				return currentTree;
			}

			if (zone === "center") {
				return addPanelToDockGroup(removalResult.node, targetGroupId, panelId);
			}

			if (!findDockGroup(removalResult.node, targetGroupId)) {
				return currentTree;
			}

			return insertPanelNearDockGroup(
				removalResult.node,
				targetGroupId,
				panelId,
				zone,
				nextDockGroupId(currentTree),
			);
		});

		setLastAction(actionLabel);
	}

	function startDockGroupTabInteraction(
		panelId: PanelId,
		sourceGroupId: string,
		event: ReactMouseEvent<HTMLButtonElement>,
	) {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		let dragStarted = false;

		function updateDrag(pointerX: number, pointerY: number) {
			const dropTarget = dockGroupDropTargetFromPoint(pointerX, pointerY);
			setDragState({
				overGroupId: dropTarget?.groupId ?? null,
				panelId,
				pointerX,
				pointerY,
				sourceGroupId,
				zone: dropTarget?.zone ?? null,
			});
		}

		function handleMouseMove(moveEvent: MouseEvent) {
			const pointerDistance = Math.hypot(
				moveEvent.clientX - startX,
				moveEvent.clientY - startY,
			);

			if (pointerDistance >= 6) {
				dragStarted = true;
			}

			if (dragStarted) {
				updateDrag(moveEvent.clientX, moveEvent.clientY);
			}
		}

		function handleMouseUp(upEvent: MouseEvent) {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);

			if (!dragStarted) {
				activatePanel(panelId, sourceGroupId);
				return;
			}

			const dropTarget = dockGroupDropTargetFromPoint(
				upEvent.clientX,
				upEvent.clientY,
			);

			if (dropTarget) {
				movePanelToGroupDrop(
					panelId,
					sourceGroupId,
					dropTarget.groupId,
					dropTarget.zone,
				);
			} else {
				setLastAction(
					`${panelDefinitions[panelId].label} returned; no occupied group under pointer.`,
				);
			}

			setDragState(null);
		}

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp, { once: true });
	}

	return (
		<section className="grid h-full grid-rows-[40px_34px_minmax(0,1fr)] bg-[#101112]">
			<TopChrome
				leadingIcon={<LayoutGrid className="size-4" />}
				subtitle="Drop on group centers for tabs, on group edges for splits"
				title="Dock groups model"
			/>
			<div className="flex min-w-0 items-center gap-2 border-y border-[#34302a] bg-[#1d1b18] px-2 text-[11px] text-[#b8ad99]">
				<button
					className="flex h-6 items-center gap-1 rounded border border-[#4a4034] bg-[#28231d] px-2 text-[#d8cdb9] hover:bg-[#332b22]"
					onClick={resetLayout}
					type="button"
				>
					<RotateCcw className="size-3" />
					Reset
				</button>
				<div className="rounded border border-[#3d3831] px-2 py-0.5 font-mono text-[10px] text-[#a69a84]">
					occupied groups: {groupCount}
				</div>
				<div className="truncate font-mono text-[#f2b84b]">{lastAction}</div>
			</div>
			<div className="relative min-h-0 border-t border-[#34302a] bg-[#11100d]">
				<DockGroupTreeRenderer
					dragState={dragState}
					node={layoutTree}
					onPanelActivated={activatePanel}
					onTabInteractionStarted={startDockGroupTabInteraction}
				/>
				{dragState ? <DockDragPreview dragState={dragState} /> : null}
				<VariantStateOverlay
					state={{
						activeDrag: dragState
							? {
									overGroupId: dragState.overGroupId,
									panelId: dragState.panelId,
									sourceGroupId: dragState.sourceGroupId,
									zone: dragState.zone,
								}
							: null,
						groupCount,
						lastAction,
						layoutTree: serializeDockGroupTree(layoutTree),
						model: "occupied dock groups",
						moveUnit: "panel tab",
						stateShape:
							"splitTree -> occupied tab groups; empty groups collapse",
					}}
					title="Group state"
					variantName="Dock groups / no empty slots"
				/>
			</div>
		</section>
	);
}

function BlenderAreaEditors() {
	const [areaTree, setAreaTree] = useState<AreaNode>(() =>
		cloneAreaNode(defaultAreaTree),
	);
	const [areaDragState, setAreaDragState] =
		useState<AreaEditorDragState | null>(null);
	const initialLeafId = firstLeafId(defaultAreaTree);
	const [selectedAreaId, setSelectedAreaId] = useState(initialLeafId);
	const [lastAreaAction, setLastAreaAction] = useState(
		"Select an area, then split, join, or change its editor type.",
	);
	const leafCount = collectAreaLeaves(areaTree).length;
	const joinPreview = findAreaJoinPreview(areaTree, selectedAreaId);
	const draggedAreaId = areaDragState?.sourceAreaId ?? null;
	const draggedEditor = areaDragState?.editor ?? null;

	const swapAreaEditors = useCallback(
		(sourceAreaId: string, targetAreaId: string) => {
			setAreaTree((currentTree) =>
				swapAreaLeafEditors(currentTree, sourceAreaId, targetAreaId),
			);
			setSelectedAreaId(targetAreaId);
			setLastAreaAction(`${sourceAreaId} swapped editor with ${targetAreaId}.`);
		},
		[],
	);

	useEffect(() => {
		if (!draggedAreaId || !draggedEditor) {
			return;
		}

		const sourceAreaId = draggedAreaId;
		const editor = draggedEditor;

		function handleMouseMove(event: MouseEvent) {
			setAreaDragState((currentDragState) =>
				currentDragState
					? {
							...currentDragState,
							pointerX: event.clientX,
							pointerY: event.clientY,
						}
					: null,
			);
		}

		function handleMouseUp(event: MouseEvent) {
			const targetElement = document
				.elementFromPoint(event.clientX, event.clientY)
				?.closest<HTMLElement>("[data-area-leaf-id]");
			const targetAreaId = targetElement?.dataset.areaLeafId;

			if (targetAreaId && targetAreaId !== sourceAreaId) {
				swapAreaEditors(sourceAreaId, targetAreaId);
			} else if (targetAreaId === sourceAreaId) {
				setLastAreaAction(
					`${panelDefinitions[editor].label} stayed in ${sourceAreaId}.`,
				);
			} else {
				setLastAreaAction(
					`${panelDefinitions[editor].label} returned; no area under pointer.`,
				);
			}

			setAreaDragState(null);
		}

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp, { once: true });

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [draggedAreaId, draggedEditor, swapAreaEditors]);

	function resetAreaLayout() {
		const nextTree = cloneAreaNode(defaultAreaTree);
		setAreaTree(nextTree);
		setSelectedAreaId(firstLeafId(nextTree));
		setAreaDragState(null);
		setLastAreaAction("Reset to the current coded default layout.");
	}

	function splitSelectedArea(direction: "row" | "column") {
		const selectedLeaf = findAreaLeaf(areaTree, selectedAreaId);

		if (!selectedLeaf) {
			return;
		}

		const newAreaId = nextAreaId(areaTree);
		const nextEditor = nextPanelId(selectedLeaf.editor);
		const nextTree = updateAreaLeaf(areaTree, selectedAreaId, (leaf) => ({
			children: [
				{ ...leaf, flex: 1 },
				{
					editor: nextEditor,
					flex: 1,
					id: newAreaId,
					kind: "leaf",
				},
			],
			direction,
			id: `split-${leaf.id}-${newAreaId}`,
			kind: "split",
		}));

		setAreaTree(nextTree);
		setSelectedAreaId(newAreaId);
		setLastAreaAction(
			`${selectedLeaf.id} split ${direction === "row" ? "left/right" : "top/bottom"}; new area uses ${panelDefinitions[nextEditor].label}.`,
		);
	}

	function joinSelectedArea() {
		const result = removeAreaLeaf(areaTree, selectedAreaId);

		if (!result.removed) {
			setLastAreaAction("No sibling to join into; split an area first.");
			return;
		}

		setAreaTree(result.node);
		setSelectedAreaId(firstLeafId(result.node));
		setLastAreaAction(
			`${selectedAreaId} removed; ${result.absorbedById ?? "its sibling"} expanded into its space.`,
		);
	}

	function changeSelectedEditor(editor: PanelId) {
		setAreaTree((currentTree) =>
			updateAreaLeaf(currentTree, selectedAreaId, (leaf) => ({
				...leaf,
				editor,
			})),
		);
		setLastAreaAction(
			`${selectedAreaId} switched to ${panelDefinitions[editor].label}.`,
		);
	}

	function resizeAreaSplit(
		splitId: string,
		firstFlex: number,
		secondFlex: number,
	) {
		setAreaTree((currentTree) =>
			updateAreaSplitFlex(currentTree, splitId, firstFlex, secondFlex),
		);
		setLastAreaAction(
			`${splitId} resized to ${Math.round(firstFlex * 100)} / ${Math.round(secondFlex * 100)}.`,
		);
	}

	function startAreaResize(
		splitNode: Extract<AreaNode, { kind: "split" }>,
		event: ReactMouseEvent<HTMLButtonElement>,
	) {
		if (event.button !== 0) {
			return;
		}

		const containerRect =
			event.currentTarget.parentElement?.getBoundingClientRect();

		if (!containerRect) {
			return;
		}

		event.preventDefault();
		const firstStartFlex = splitNode.children[0].flex ?? 1;
		const secondStartFlex = splitNode.children[1].flex ?? 1;
		const totalFlex = firstStartFlex + secondStartFlex;
		const minFlex = totalFlex * 0.12;
		const maxFlex = totalFlex - minFlex;
		const startPointer =
			splitNode.direction === "row" ? event.clientX : event.clientY;
		const availableSize =
			splitNode.direction === "row"
				? containerRect.width
				: containerRect.height;

		function handleMouseMove(moveEvent: MouseEvent) {
			const currentPointer =
				splitNode.direction === "row" ? moveEvent.clientX : moveEvent.clientY;
			const pointerDelta = currentPointer - startPointer;
			const flexDelta = (pointerDelta / availableSize) * totalFlex;
			const firstFlex = clampFlex(firstStartFlex + flexDelta, minFlex, maxFlex);
			const secondFlex = totalFlex - firstFlex;

			resizeAreaSplit(splitNode.id, firstFlex, secondFlex);
		}

		function handleMouseUp() {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		}

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	}

	function startAreaEditorDrag(
		areaId: string,
		editor: PanelId,
		event: ReactMouseEvent<HTMLButtonElement>,
	) {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		setSelectedAreaId(areaId);
		setAreaDragState({
			editor,
			pointerX: event.clientX,
			pointerY: event.clientY,
			sourceAreaId: areaId,
		});
		setLastAreaAction(
			`Dragging ${panelDefinitions[editor].label}; release over another area to swap editors.`,
		);
	}

	return (
		<section className="grid h-full grid-rows-[40px_34px_minmax(0,1fr)] bg-[#151515]">
			<TopChrome
				leadingIcon={<GitBranch className="size-4" />}
				subtitle="Drag editor headers, resize split handles, split or join areas"
				title="Blender model"
			/>
			<div className="flex min-w-0 items-center gap-1 border-y border-[#343434] bg-[#202020] px-2 text-[11px] text-[#b8b8b8]">
				<BlenderMenuButton
					icon={<Menu className="size-3.5" />}
					label="Layout"
				/>
				<BlenderMenuButton
					icon={<SplitSquareHorizontal className="size-3.5" />}
					label="Split left/right"
					onClick={() => splitSelectedArea("row")}
				/>
				<BlenderMenuButton
					icon={<SplitSquareVertical className="size-3.5" />}
					label="Split top/bottom"
					onClick={() => splitSelectedArea("column")}
				/>
				<BlenderMenuButton
					disabled={!joinPreview}
					icon={<Rows3 className="size-3.5" />}
					label={
						joinPreview
							? `Join into ${joinPreview.siblingId}`
							: "Join unavailable"
					}
					onClick={joinSelectedArea}
				/>
				<BlenderMenuButton
					icon={<RotateCcw className="size-3.5" />}
					label="Reset"
					onClick={resetAreaLayout}
				/>
				<div className="ml-auto truncate font-mono text-[#8e8e8e]">
					selected: {selectedAreaId} / areas: {leafCount} /{" "}
					{joinPreview
						? `join target: ${joinPreview.siblingId}`
						: "join target: none"}{" "}
					/ {lastAreaAction}
				</div>
			</div>
			<div className="min-h-0 bg-[#111]">
				<AreaTreeRenderer
					draggedAreaId={draggedAreaId}
					node={areaTree}
					onEditorChange={changeSelectedEditor}
					onEditorDragStarted={startAreaEditorDrag}
					onResizeStarted={startAreaResize}
					onSelectArea={setSelectedAreaId}
					selectedAreaId={selectedAreaId}
				/>
			</div>
			<AreaJoinCoach joinPreview={joinPreview} />
			{areaDragState ? (
				<AreaEditorDragPreview dragState={areaDragState} />
			) : null}
			<VariantStateOverlay
				state={{
					activeDrag: areaDragState
						? {
								editor: areaDragState.editor,
								sourceAreaId: areaDragState.sourceAreaId,
							}
						: null,
					areaTree: serializeAreaTree(areaTree),
					joinPreview,
					lastAction: lastAreaAction,
					model: "area/editor layout",
					moveUnit: "area editor header and split boundary",
					selectedAreaId,
					stateShape:
						"layoutTree -> split nodes with flex children -> leaf editor types",
				}}
				title="Area state"
				variantName="Blender areas/editors"
			/>
		</section>
	);
}

function TopChrome({
	leadingIcon,
	subtitle,
	title,
}: {
	leadingIcon: ReactNode;
	subtitle: string;
	title: string;
}) {
	return (
		<header className="grid min-w-0 grid-cols-[minmax(18rem,auto)_minmax(0,1fr)_auto] items-center gap-4 border-b border-[#2c2925] bg-[#171512] px-3">
			<div className="flex min-w-0 items-center gap-2">
				<div className="flex size-7 items-center justify-center rounded border border-[#4a4034] bg-[#272119] text-[#f2b84b]">
					{leadingIcon}
				</div>
				<div className="min-w-0">
					<h1 className="truncate text-xs font-semibold uppercase tracking-normal">
						{title}
					</h1>
					<p className="truncate text-[10px] uppercase tracking-[0.16em] text-[#a69a84]">
						{subtitle}
					</p>
				</div>
			</div>
			<div className="hidden min-w-0 justify-center gap-3 font-mono text-[11px] text-[#a69a84] lg:flex">
				<span className="truncate">{prototypeState.asset}</span>
				<span>|</span>
				<span>{prototypeState.playhead}</span>
				<span>|</span>
				<span>{prototypeState.selection}</span>
			</div>
			<div className="flex items-center gap-1.5 text-[11px] text-[#b8ad99]">
				<Settings2 className="size-3.5" />
				JSON layout preset
			</div>
		</header>
	);
}

function DockRail({ dockTargets }: { dockTargets: DockTargetState[] }) {
	return (
		<aside className="row-span-3 flex min-h-0 flex-col items-center gap-2 border-r border-[#34302a] bg-[#141311] px-1.5 py-3">
			{panelOrder.map((panelId) => {
				const panel = panelDefinitions[panelId];
				const Icon = panel.icon;
				const target = dockTargets.find((candidateTarget) =>
					candidateTarget.panels.includes(panelId),
				);

				return (
					<div
						className="flex size-8 items-center justify-center rounded border border-[#38332d] bg-[#201d18] text-[#b8ad99]"
						key={panel.id}
						title={`${panel.label}${target ? ` in ${target.id}` : ""}`}
					>
						<Icon className="size-4" />
					</div>
				);
			})}
		</aside>
	);
}

function DockTargetFrame({
	className,
	draggedPanel,
	onActivatePanel,
	onTabInteractionStarted,
	state,
}: {
	className?: string;
	draggedPanel: PanelId | null;
	onActivatePanel: (panelId: PanelId, targetId: DockTargetId) => void;
	onTabInteractionStarted: (
		panelId: PanelId,
		sourceTargetId: DockTargetId,
		event: ReactMouseEvent<HTMLButtonElement>,
	) => void;
	state: DockTargetState;
}) {
	const activePanel = state.activePanel;
	const dropActive = draggedPanel !== null;

	return (
		<section
			aria-label={state.label}
			className={`relative min-h-0 min-w-0 overflow-hidden bg-[#171512] ${className ?? ""}`}
			data-dock-target-id={state.id}
			data-testid={`dock-target-${state.id}`}
		>
			<div className="flex h-8 min-w-0 items-center justify-between border-b border-[#34302a] bg-[#211d18]">
				<div className="flex min-w-0 items-center">
					{state.panels.length === 0 ? (
						<div className="px-2 text-[11px] text-[#746a5c]">empty target</div>
					) : null}
					{state.panels.map((panelId) => (
						<DraggableDockTab
							active={activePanel === panelId}
							key={panelId}
							onActivate={() => onActivatePanel(panelId, state.id)}
							onTabInteractionStarted={(event) =>
								onTabInteractionStarted(panelId, state.id, event)
							}
							panelId={panelId}
						/>
					))}
				</div>
				<div className="flex items-center gap-1 pr-2 text-[#817769]">
					<Grip className="size-3.5" />
					<span className="font-mono text-[10px]">{state.id}</span>
				</div>
			</div>
			<div className="h-[calc(100%-2rem)] min-h-0 overflow-hidden">
				{activePanel ? (
					renderPanel(activePanel)
				) : (
					<EmptyDockTarget targetLabel={state.label} />
				)}
			</div>
			<div
				className={`pointer-events-none absolute inset-1 rounded border border-dashed transition-colors ${
					dropActive
						? "border-[#f2b84b]/80 bg-[#f2b84b]/5"
						: "border-transparent"
				}`}
			/>
		</section>
	);
}

function DraggableDockTab({
	active,
	onActivate,
	onTabInteractionStarted,
	panelId,
}: {
	active: boolean;
	onActivate: () => void;
	onTabInteractionStarted: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	panelId: PanelId;
}) {
	const panel = panelDefinitions[panelId];
	const Icon = panel.icon;

	return (
		<button
			className={`flex h-8 min-w-0 touch-none items-center gap-1.5 border-r border-[#34302a] px-2 text-[11px] ${
				active
					? "bg-[#28231d] text-[#f2eadb]"
					: "bg-[#181613] text-[#958b7c] hover:bg-[#211d18]"
			}`}
			data-testid={`dock-tab-${panelId}`}
			onClick={(event) => {
				if (event.detail === 0) {
					onActivate();
				}
			}}
			onMouseDown={onTabInteractionStarted}
			title={`Drag ${panel.label}`}
			type="button"
		>
			<Icon
				className={`size-3.5 shrink-0 ${panel.accentIconClassName} ${
					active ? "" : "opacity-70"
				}`}
			/>
			<span className="truncate">{panel.shortLabel}</span>
		</button>
	);
}

function DockDragPreview({ dragState }: { dragState: DockDragState }) {
	const panel = panelDefinitions[dragState.panelId];
	const Icon = panel.icon;

	return (
		<div
			className="pointer-events-none fixed z-50 flex items-center gap-2 rounded border border-[#f2b84b] bg-[#191613]/95 px-3 py-2 text-xs text-[#f2eadb] shadow-2xl shadow-black/60"
			style={{
				left: dragState.pointerX + 12,
				top: dragState.pointerY + 12,
			}}
		>
			<Icon className={`size-3.5 ${panel.accentIconClassName}`} />
			<span>{panel.label}</span>
		</div>
	);
}

function EmptyDockTarget({ targetLabel }: { targetLabel: string }) {
	return (
		<div className="grid h-full place-items-center p-4 text-center text-xs text-[#817769]">
			<div className="rounded border border-dashed border-[#4a4034] px-4 py-3">
				Drop a panel tab into {targetLabel}.
			</div>
		</div>
	);
}

function DockInstructions({
	draggedPanel,
	lastAction,
	onPanelPicked,
	onReset,
	onTargetPicked,
	pickedPanel,
}: {
	draggedPanel: PanelId | null;
	lastAction: string;
	onPanelPicked: (panelId: PanelId) => void;
	onReset: () => void;
	onTargetPicked: (targetId: DockTargetId) => void;
	pickedPanel: PanelId | null;
}) {
	const [position, setPosition] = useState<FloatingPosition>({ x: 62, y: 48 });

	function startInstructionDrag(event: ReactMouseEvent<HTMLButtonElement>) {
		if (event.button !== 0) {
			return;
		}

		const panelElement = event.currentTarget.closest<HTMLElement>(
			"[data-dock-helper-panel]",
		);
		const containerElement = panelElement?.parentElement;

		if (!panelElement || !containerElement) {
			return;
		}

		event.preventDefault();
		const containerRect = containerElement.getBoundingClientRect();
		const panelRect = panelElement.getBoundingClientRect();
		const offsetX = event.clientX - panelRect.left;
		const offsetY = event.clientY - panelRect.top;

		function handleMouseMove(moveEvent: MouseEvent) {
			setPosition(
				clampFloatingPosition(
					{
						x: moveEvent.clientX - containerRect.left - offsetX,
						y: moveEvent.clientY - containerRect.top - offsetY,
					},
					containerRect,
					panelRect,
				),
			);
		}

		function handleMouseUp() {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		}

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	}

	return (
		<div
			className="pointer-events-none absolute w-[330px] rounded border border-[#544b40] bg-[#11100d]/92 shadow-2xl shadow-black/50 backdrop-blur"
			data-dock-helper-panel=""
			data-testid="dock-helper-panel"
			style={{ left: position.x, top: position.y }}
		>
			<div className="flex h-8 items-center justify-between border-b border-[#34302a] px-2 text-xs">
				<button
					aria-label="Move Try it helper"
					className="pointer-events-auto flex h-7 min-w-0 flex-1 cursor-move items-center gap-2 text-left text-[#f2eadb] outline-none focus:text-[#f2b84b]"
					data-testid="dock-helper-drag-handle"
					onMouseDown={startInstructionDrag}
					title="Drag to move this helper"
					type="button"
				>
					<MousePointer2 className="size-3.5 text-[#f2b84b]" />
					<span>Try it</span>
					<Grip className="ml-auto size-3.5 text-[#817769]" />
				</button>
				<button
					className="pointer-events-auto ml-2 flex h-6 items-center gap-1 rounded border border-[#4a4034] px-2 text-[11px] text-[#d8cdb9] hover:bg-[#28231d]"
					onClick={onReset}
					type="button"
				>
					<RotateCcw className="size-3" />
					Reset
				</button>
			</div>
			<div className="grid gap-1.5 p-2 text-[11px] leading-5 text-[#c8bdad]">
				<p>
					Drag any tab between dock targets. Drop onto occupied targets to
					create tab groups.
				</p>
				<p>Click tabs to reveal panels hidden behind other panels.</p>
				<div className="mt-1 grid gap-1">
					<div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#958b7c]">
						Click fallback
					</div>
					<div className="flex flex-wrap gap-1">
						{panelOrder.map((panelId) => (
							<button
								className={`pointer-events-auto rounded border px-1.5 py-0.5 text-[10px] ${
									pickedPanel === panelId
										? "border-[#f2b84b] bg-[#f2b84b] text-[#19130c]"
										: "border-[#4a4034] bg-[#171512] text-[#d8cdb9]"
								}`}
								data-testid={`pick-panel-${panelId}`}
								key={panelId}
								onClick={() => onPanelPicked(panelId)}
								type="button"
							>
								{panelDefinitions[panelId].shortLabel}
							</button>
						))}
					</div>
					<div className="flex flex-wrap gap-1">
						{(
							["left", "center", "right", "strip", "bottom"] as DockTargetId[]
						).map((targetId) => (
							<button
								className="pointer-events-auto rounded border border-[#4a4034] bg-[#201d18] px-1.5 py-0.5 font-mono text-[10px] text-[#d8cdb9] hover:bg-[#28231d]"
								data-testid={`send-to-${targetId}`}
								key={targetId}
								onClick={() => onTargetPicked(targetId)}
								type="button"
							>
								{targetId}
							</button>
						))}
					</div>
				</div>
				<p className="font-mono text-[#f2b84b]">
					{draggedPanel
						? `Dragging ${panelDefinitions[draggedPanel].label}`
						: `${pickedPanel ? `${panelDefinitions[pickedPanel].label} picked. ` : ""}${lastAction}`}
				</p>
			</div>
		</div>
	);
}

function DockGroupTreeRenderer({
	dragState,
	node,
	onPanelActivated,
	onTabInteractionStarted,
}: {
	dragState: DockGroupDragState | null;
	node: DockGroupNode;
	onPanelActivated: (panelId: PanelId, groupId: string) => void;
	onTabInteractionStarted: (
		panelId: PanelId,
		sourceGroupId: string,
		event: ReactMouseEvent<HTMLButtonElement>,
	) => void;
}) {
	if (node.kind === "group") {
		return (
			<DockGroupFrame
				dragState={dragState}
				group={node}
				onPanelActivated={onPanelActivated}
				onTabInteractionStarted={onTabInteractionStarted}
			/>
		);
	}

	return (
		<div
			className={`flex h-full min-h-0 min-w-0 ${
				node.direction === "row" ? "flex-row" : "flex-col"
			}`}
			style={{ flex: node.flex ?? 1 }}
		>
			<DockGroupTreeRenderer
				dragState={dragState}
				node={node.children[0]}
				onPanelActivated={onPanelActivated}
				onTabInteractionStarted={onTabInteractionStarted}
			/>
			<div
				className={`shrink-0 bg-[#2f2a24] ${
					node.direction === "row" ? "w-1.5" : "h-1.5"
				}`}
			/>
			<DockGroupTreeRenderer
				dragState={dragState}
				node={node.children[1]}
				onPanelActivated={onPanelActivated}
				onTabInteractionStarted={onTabInteractionStarted}
			/>
		</div>
	);
}

function DockGroupFrame({
	dragState,
	group,
	onPanelActivated,
	onTabInteractionStarted,
}: {
	dragState: DockGroupDragState | null;
	group: Extract<DockGroupNode, { kind: "group" }>;
	onPanelActivated: (panelId: PanelId, groupId: string) => void;
	onTabInteractionStarted: (
		panelId: PanelId,
		sourceGroupId: string,
		event: ReactMouseEvent<HTMLButtonElement>,
	) => void;
}) {
	const activePanel = group.activePanel;
	const activeZone =
		dragState?.overGroupId === group.id ? dragState.zone : null;

	return (
		<section
			aria-label={group.id}
			className="relative min-h-0 min-w-[10rem] overflow-hidden border border-[#34302a] bg-[#171512]"
			data-dock-group-id={group.id}
			data-testid={`dock-group-${group.id}`}
			style={{ flex: group.flex ?? 1 }}
		>
			<div className="flex h-8 min-w-0 items-center justify-between border-b border-[#34302a] bg-[#211d18]">
				<div className="flex min-w-0 items-center">
					{group.panels.map((panelId) => (
						<DraggableDockTab
							active={activePanel === panelId}
							key={panelId}
							onActivate={() => onPanelActivated(panelId, group.id)}
							onTabInteractionStarted={(event) =>
								onTabInteractionStarted(panelId, group.id, event)
							}
							panelId={panelId}
						/>
					))}
				</div>
				<div className="flex shrink-0 items-center gap-1 pr-2 text-[#817769]">
					<Grip className="size-3.5" />
					<span className="font-mono text-[10px]">
						{group.id.replace("group-", "")} / {group.panels.length}
					</span>
				</div>
			</div>
			<div className="h-[calc(100%-2rem)] min-h-0 overflow-hidden">
				{renderPanel(activePanel)}
			</div>
			{dragState ? <DockGroupDropOverlay activeZone={activeZone} /> : null}
		</section>
	);
}

function DockGroupDropOverlay({
	activeZone,
}: {
	activeZone: DockGroupDropZone | null;
}) {
	return (
		<div className="pointer-events-none absolute inset-0 z-20">
			{(
				["left", "right", "top", "bottom", "center"] as DockGroupDropZone[]
			).map((zone) => (
				<div
					className={`${dockGroupDropZoneClassName(zone)} ${
						activeZone === zone
							? "border-[#f2b84b] bg-[#f2b84b]/22 text-[#f2b84b]"
							: "border-[#f2b84b]/20 bg-[#f2b84b]/4 text-transparent"
					}`}
					key={zone}
				>
					<span className="rounded bg-black/55 px-1.5 py-0.5">
						{zone === "center" ? "tab" : zone}
					</span>
				</div>
			))}
		</div>
	);
}

function AreaTreeRenderer({
	draggedAreaId,
	node,
	onEditorChange,
	onEditorDragStarted,
	onResizeStarted,
	onSelectArea,
	selectedAreaId,
}: {
	draggedAreaId: string | null;
	node: AreaNode;
	onEditorChange: (editor: PanelId) => void;
	onEditorDragStarted: (
		areaId: string,
		editor: PanelId,
		event: ReactMouseEvent<HTMLButtonElement>,
	) => void;
	onResizeStarted: (
		splitNode: Extract<AreaNode, { kind: "split" }>,
		event: ReactMouseEvent<HTMLButtonElement>,
	) => void;
	onSelectArea: (areaId: string) => void;
	selectedAreaId: string;
}) {
	if (node.kind === "leaf") {
		return (
			<BlenderArea
				area={node}
				draggedAreaId={draggedAreaId}
				onEditorChange={onEditorChange}
				onEditorDragStarted={onEditorDragStarted}
				onSelectArea={onSelectArea}
				selected={selectedAreaId === node.id}
			/>
		);
	}

	return (
		<div
			className={`flex h-full min-h-0 min-w-0 ${
				node.direction === "row" ? "flex-row" : "flex-col"
			}`}
			style={{ flex: node.flex ?? 1 }}
		>
			<AreaTreeRenderer
				draggedAreaId={draggedAreaId}
				node={node.children[0]}
				onEditorChange={onEditorChange}
				onEditorDragStarted={onEditorDragStarted}
				onResizeStarted={onResizeStarted}
				onSelectArea={onSelectArea}
				selectedAreaId={selectedAreaId}
			/>
			<AreaResizeHandle node={node} onResizeStarted={onResizeStarted} />
			<AreaTreeRenderer
				draggedAreaId={draggedAreaId}
				node={node.children[1]}
				onEditorChange={onEditorChange}
				onEditorDragStarted={onEditorDragStarted}
				onResizeStarted={onResizeStarted}
				onSelectArea={onSelectArea}
				selectedAreaId={selectedAreaId}
			/>
		</div>
	);
}

function AreaResizeHandle({
	node,
	onResizeStarted,
}: {
	node: Extract<AreaNode, { kind: "split" }>;
	onResizeStarted: (
		splitNode: Extract<AreaNode, { kind: "split" }>,
		event: ReactMouseEvent<HTMLButtonElement>,
	) => void;
}) {
	const isRow = node.direction === "row";

	return (
		<button
			aria-label={`Resize ${node.id}`}
			className={`group relative z-20 shrink-0 bg-[#2d2d2d] outline-none transition-colors hover:bg-[#f2b84b]/80 focus:ring-1 focus:ring-[#f2b84b] ${
				isRow ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"
			}`}
			data-resize-direction={node.direction}
			data-testid={`area-resize-${node.id}`}
			onMouseDown={(event) => onResizeStarted(node, event)}
			title={`Drag to resize ${node.id}`}
			type="button"
		>
			<span
				className={`absolute bg-[#777] transition-colors group-hover:bg-[#1b1510] ${
					isRow
						? "left-1/2 top-2 h-[calc(100%-1rem)] w-px -translate-x-1/2"
						: "left-2 top-1/2 h-px w-[calc(100%-1rem)] -translate-y-1/2"
				}`}
			/>
		</button>
	);
}

function BlenderArea({
	area,
	draggedAreaId,
	onEditorChange,
	onEditorDragStarted,
	onSelectArea,
	selected,
}: {
	area: Extract<AreaNode, { kind: "leaf" }>;
	draggedAreaId: string | null;
	onEditorChange: (editor: PanelId) => void;
	onEditorDragStarted: (
		areaId: string,
		editor: PanelId,
		event: ReactMouseEvent<HTMLButtonElement>,
	) => void;
	onSelectArea: (areaId: string) => void;
	selected: boolean;
}) {
	const panel = panelDefinitions[area.editor];
	const Icon = panel.icon;
	const isDropCandidate = draggedAreaId !== null && draggedAreaId !== area.id;
	const isDragSource = draggedAreaId === area.id;

	return (
		<section
			aria-label={area.id}
			className={`relative min-h-0 min-w-[9rem] overflow-hidden border bg-[#181818] ${
				selected
					? "border-[#f2b84b] ring-1 ring-[#f2b84b]/60"
					: "border-[#343434]"
			}`}
			data-area-leaf-id={area.id}
			data-testid={`area-${area.id}`}
			onMouseDown={() => onSelectArea(area.id)}
			style={{ flex: area.flex ?? 1 }}
		>
			<div className="flex h-8 min-w-0 items-center justify-between border-b border-[#343434] bg-[#242424] px-2 text-[11px] text-[#c8c8c8]">
				<div className="flex min-w-0 items-center gap-2">
					<button
						aria-label={`Drag ${panel.label} from ${area.id}`}
						className="flex size-5 shrink-0 touch-none items-center justify-center rounded border border-[#444] bg-[#303030] text-[#9d9d9d] hover:border-[#f2b84b] hover:text-[#f2b84b]"
						data-testid={`area-drag-${area.id}`}
						onMouseDown={(event) =>
							onEditorDragStarted(area.id, area.editor, event)
						}
						title={`Drag ${panel.label} to another area`}
						type="button"
					>
						<Grip className="size-3.5" />
					</button>
					<Icon className="size-3.5 shrink-0" />
					<select
						className="h-5 min-w-0 rounded border border-[#454545] bg-[#303030] px-1 text-[11px] text-[#c8c8c8] outline-none focus:border-[#f2b84b]"
						onChange={(event) =>
							onEditorChange(event.currentTarget.value as PanelId)
						}
						onFocus={() => onSelectArea(area.id)}
						value={area.editor}
					>
						{panelOrder.map((panelId) => (
							<option key={panelId} value={panelId}>
								{panelDefinitions[panelId].label}
							</option>
						))}
					</select>
					<span className="font-mono text-[10px] text-[#888]">{area.id}</span>
				</div>
				<div className="flex items-center gap-1.5 text-[#8a8a8a]">
					<span className="font-mono text-[10px]">
						{selected ? "selected" : "area"}
					</span>
				</div>
			</div>
			<div className="h-[calc(100%-2rem)] min-h-0 overflow-hidden">
				{renderPanel(area.editor)}
			</div>
			{isDropCandidate ? (
				<div className="pointer-events-none absolute inset-1 z-10 grid place-items-center border border-dashed border-[#f2b84b]/80 bg-[#f2b84b]/10 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f2b84b]">
					Drop editor here
				</div>
			) : null}
			{isDragSource ? (
				<div className="pointer-events-none absolute inset-0 z-10 bg-black/28" />
			) : null}
			<div className="absolute bottom-0 right-0 h-0 w-0 border-b-[13px] border-l-[13px] border-b-[#6f6f6f] border-l-transparent" />
			<div className="absolute bottom-1 right-1 h-0 w-0 border-b-[7px] border-l-[7px] border-b-[#242424] border-l-transparent" />
		</section>
	);
}

function AreaEditorDragPreview({
	dragState,
}: {
	dragState: AreaEditorDragState;
}) {
	const panel = panelDefinitions[dragState.editor];
	const Icon = panel.icon;

	return (
		<div
			className="pointer-events-none fixed z-50 flex items-center gap-2 rounded border border-[#f2b84b] bg-[#191919]/95 px-3 py-2 text-xs text-[#f2eadb] shadow-2xl shadow-black/60"
			style={{
				left: dragState.pointerX + 12,
				top: dragState.pointerY + 12,
			}}
		>
			<Grip className="size-3.5 text-[#f2b84b]" />
			<Icon className="size-3.5" />
			<span>{panel.label}</span>
			<span className="font-mono text-[#9d9d9d]">{dragState.sourceAreaId}</span>
		</div>
	);
}

function MediaAssetPanel() {
	return (
		<div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 text-xs">
			<div className="rounded border border-[#3a342d] bg-[#211d18] p-2">
				<div className="truncate text-sm font-semibold text-[#f4e8d4]">
					{prototypeState.asset}
				</div>
				<div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#aea38f]">
					<Metric label="Size" value="30.0 MB" />
					<Metric label="Duration" value="00:13.500" />
					<Metric label="Codec" value="H.264 / AAC" />
					<Metric label="Frames" value="60 fps" />
				</div>
			</div>
			<div className="flex min-h-0 flex-col gap-2 overflow-hidden">
				<PanelSubhead>Tracks</PanelSubhead>
				<TrackRow label="Video" meta="3840 x 2160 / H.264" />
				<TrackRow label="Voice" meta="AAC / stereo / en" />
				<TrackRow label="Desktop" meta="AAC / stereo / und" />
			</div>
			<div className="mt-auto rounded border border-[#3a342d] bg-[#1b1815] p-2">
				<PanelSubhead>Selection</PanelSubhead>
				<div className="mt-1 font-mono text-[11px] text-[#f2b84b]">
					{prototypeState.selection}
				</div>
			</div>
		</div>
	);
}

function PreviewViewerPanel() {
	return (
		<div className="grid h-full min-h-0 place-items-center bg-[#090909] p-4">
			<div className="relative aspect-video w-full max-w-5xl overflow-hidden border border-[#3a342d] bg-black shadow-2xl shadow-black/60">
				<img
					alt="Prototype video frame"
					className="h-full w-full object-cover opacity-90"
					src={frameImage}
				/>
				<div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-3 text-[11px] text-[#d7d0c1]">
					<span className="font-mono">Preview viewer</span>
					<span>3840 x 2160</span>
				</div>
				<div className="absolute left-[18%] right-[28%] top-1/2 h-px bg-[#f2b84b]" />
				<div className="absolute bottom-3 left-3 rounded bg-black/65 px-2 py-1 font-mono text-xs text-[#f2eadb]">
					{prototypeState.playhead}
				</div>
			</div>
		</div>
	);
}

function TransportPanel() {
	return (
		<div className="flex h-full min-w-0 items-center gap-3 overflow-hidden bg-[#221d18] px-3 text-xs text-[#d9cebc]">
			<div className="flex items-center gap-1">
				<button
					className="flex size-8 items-center justify-center rounded border border-[#4a4034] bg-[#f2b84b] text-[#19130c]"
					type="button"
				>
					<Play className="size-4" />
				</button>
				<button
					className="flex size-7 items-center justify-center rounded border border-[#4a4034] bg-[#171512]"
					type="button"
				>
					<Pause className="size-3.5" />
				</button>
			</div>
			<div className="font-mono text-[11px]">{prototypeState.playhead}</div>
			<div className="h-1 min-w-24 flex-1 overflow-hidden rounded bg-[#3c352c]">
				<div className="h-full w-[32%] bg-[#f2b84b]" />
			</div>
			<button
				className="rounded border border-[#4a4034] px-2 py-1 font-mono text-[11px]"
				type="button"
			>
				[ set in
			</button>
			<button
				className="rounded border border-[#4a4034] px-2 py-1 font-mono text-[11px]"
				type="button"
			>
				] set out
			</button>
			<div className="flex items-center gap-1">
				<Volume2 className="size-4 text-[#d9cebc]" />
				<div className="h-1 w-20 rounded bg-[#3c352c]">
					<div className="h-full w-[70%] rounded bg-[#74d7ff]" />
				</div>
			</div>
			<div className="rounded border border-[#4a4034] px-2 py-1 font-mono text-[11px]">
				1.0x
			</div>
			<Maximize2 className="size-4 text-[#958b7c]" />
		</div>
	);
}

function WaveformPanel({ compact }: { compact: boolean }) {
	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#141812]">
			<div className="flex h-8 items-center justify-between border-b border-[#30382d] px-3 text-[11px] text-[#b8d6ad]">
				<div className="flex items-center gap-2">
					<Scissors className="size-3.5" />
					<span>Selection/Waveform</span>
					<span className="font-mono text-[#7da06f]">
						{prototypeState.selection}
					</span>
				</div>
				<div className="font-mono text-[#7da06f]">zoom 1.4x</div>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden p-2">
				{["Voice", "Desktop"].map((label, index) => (
					<div
						className="mb-2 grid h-[calc(50%-0.25rem)] min-h-12 grid-cols-[92px_minmax(0,1fr)] overflow-hidden border border-[#30382d] bg-[#1b2118]"
						key={label}
					>
						<div className="flex flex-col justify-center border-r border-[#30382d] px-2 text-[11px]">
							<span className="font-semibold text-[#dcebd6]">{label}</span>
							<span className="text-[#7da06f]">included / 100%</span>
						</div>
						<div className="relative flex items-center gap-1 px-2">
							<div className="absolute inset-y-0 left-[18%] right-[28%] bg-[#f2b84b]/14 ring-1 ring-[#f2b84b]/35" />
							<div className="absolute inset-y-0 left-[32%] w-0.5 bg-[#f07d55]" />
							{waveBars(index).map((bar) => (
								<div
									className="w-1 rounded bg-[#9ee37d]/75"
									key={bar.id}
									style={{
										height: `${compact ? bar.height / 1.5 : bar.height}px`,
									}}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function ExportInspectorPanel() {
	return (
		<div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 text-xs">
			<div className="rounded border border-[#463652] bg-[#211925] p-2.5">
				<PanelSubhead>Export settings</PanelSubhead>
				<div className="mt-2 flex flex-col gap-1.5">
					<InspectorLine label="Output" value="MP4 / H.264 / AAC" />
					<InspectorLine label="Strategy" value="Default browser export" />
					<InspectorLine label="Precision" value="Best effort" />
					<InspectorLine label="Runtime" value="WebCodecs ready" />
				</div>
			</div>
			<div className="rounded border border-[#463652] bg-[#19161c] p-2.5">
				<PanelSubhead>Generated media</PanelSubhead>
				<div className="mt-2 rounded border border-[#5f4a71] bg-[#2a2031] px-2 py-2 text-[#eadcff]">
					Ready to export
				</div>
			</div>
			<button
				className="mt-auto h-9 rounded border border-[#d7a8ff]/50 bg-[#d7a8ff] text-sm font-semibold text-[#1c1024]"
				type="button"
			>
				Start export
			</button>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="truncate text-[#8f8474]">{label}</div>
			<div className="truncate font-mono text-[#f2eadb]">{value}</div>
		</div>
	);
}

function PanelSubhead({ children }: { children: ReactNode }) {
	return (
		<div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#958b7c]">
			{children}
		</div>
	);
}

function TrackRow({ label, meta }: { label: string; meta: string }) {
	return (
		<div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-2 rounded border border-[#3a342d] bg-[#1f1b16] px-2 py-1.5">
			<Film className="size-3.5 text-[#f2b84b]" />
			<div className="min-w-0">
				<div className="truncate text-[#f2eadb]">{label}</div>
				<div className="truncate text-[10px] text-[#8f8474]">{meta}</div>
			</div>
		</div>
	);
}

function InspectorLine({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 text-[11px]">
			<div className="truncate text-[#9e8cab]">{label}</div>
			<div className="truncate text-right font-mono text-[#f2eadb]">
				{value}
			</div>
		</div>
	);
}

function BlenderMenuButton({
	disabled,
	icon,
	label,
	onClick,
}: {
	disabled?: boolean;
	icon: ReactNode;
	label: string;
	onClick?: () => void;
}) {
	return (
		<button
			className="flex h-6 items-center gap-1 rounded border border-[#3b3b3b] bg-[#292929] px-2 hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-45"
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{icon}
			<span>{label}</span>
		</button>
	);
}

function AreaJoinCoach({
	joinPreview,
}: {
	joinPreview: AreaJoinPreview | null;
}) {
	return (
		<div className="pointer-events-none fixed left-4 top-20 z-40 w-[360px] rounded border border-[#3b3b3b] bg-[#151515]/88 p-3 text-[11px] leading-5 text-[#c8c8c8] shadow-2xl shadow-black/50 backdrop-blur">
			<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f2b84b]">
				Join preview
			</div>
			{joinPreview ? (
				<p>
					Join removes{" "}
					<span className="font-mono text-[#f2b84b]">
						{joinPreview.selectedId}
					</span>{" "}
					and lets{" "}
					<span className="font-mono text-[#f2b84b]">
						{joinPreview.siblingId}
					</span>{" "}
					expand into that space. Their parent split is{" "}
					<span className="font-mono">{joinPreview.direction}</span>.
				</p>
			) : (
				<p>
					This area has no removable sibling yet. Split an area first; then the
					new sibling can absorb the selected area.
				</p>
			)}
		</div>
	);
}

function VariantStateOverlay({
	state,
	title,
	variantName,
}: {
	state: Record<string, unknown>;
	title: string;
	variantName: string;
}) {
	return (
		<aside className="pointer-events-none fixed bottom-20 right-4 z-40 w-[350px] rounded border border-white/15 bg-black/72 p-3 shadow-2xl shadow-black/50 backdrop-blur">
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#f2b84b]">
					{title}
				</div>
				<div className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
					{variantName}
				</div>
			</div>
			<pre className="max-h-44 overflow-hidden whitespace-pre-wrap font-mono text-[10px] leading-4 text-white/72">
				{JSON.stringify(
					{
						...state,
						currentAsset: prototypeState.asset,
						currentSelection: prototypeState.selection,
					},
					null,
					2,
				)}
			</pre>
		</aside>
	);
}

function PrototypeSwitcher({
	current,
	onNext,
	onPrevious,
}: {
	current: Variant;
	onNext: () => void;
	onPrevious: () => void;
}) {
	if (import.meta.env.PROD) {
		return null;
	}

	return (
		<div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/18 bg-[#070707]/88 px-2 py-2 text-[#f2eadb] shadow-2xl shadow-black/50 backdrop-blur">
			<button
				aria-label="Previous prototype variant"
				className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/12"
				onClick={onPrevious}
				type="button"
			>
				<ArrowLeft className="size-4" />
			</button>
			<div className="min-w-72 text-center text-sm">
				<span className="font-mono uppercase">{current.key}</span>
				<span className="text-white/35"> / </span>
				<span>{current.name}</span>
			</div>
			<button
				aria-label="Next prototype variant"
				className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/12"
				onClick={onNext}
				type="button"
			>
				<ArrowRight className="size-4" />
			</button>
		</div>
	);
}

function readVariantFromUrl(): VariantKey {
	if (typeof window === "undefined") {
		return "dock";
	}

	const requestedVariant = new URLSearchParams(window.location.search).get(
		"variant",
	);

	return variants.some((variant) => variant.key === requestedVariant)
		? (requestedVariant as VariantKey)
		: "dock";
}

function renderPanel(panelId: PanelId) {
	switch (panelId) {
		case "media":
			return <MediaAssetPanel />;
		case "preview":
			return <PreviewViewerPanel />;
		case "transport":
			return <TransportPanel />;
		case "waveform":
			return <WaveformPanel compact={false} />;
		case "export":
			return <ExportInspectorPanel />;
	}
}

function cloneDockTargets(targets: DockTargetState[]): DockTargetState[] {
	return targets.map((target) => ({
		...target,
		panels: [...target.panels],
	}));
}

function cloneDockGroupNode(node: DockGroupNode): DockGroupNode {
	if (node.kind === "group") {
		return {
			...node,
			panels: [...node.panels],
		};
	}

	return {
		...node,
		children: [
			cloneDockGroupNode(node.children[0]),
			cloneDockGroupNode(node.children[1]),
		],
	};
}

function collectDockGroups(
	node: DockGroupNode,
): Extract<DockGroupNode, { kind: "group" }>[] {
	if (node.kind === "group") {
		return [node];
	}

	return [
		...collectDockGroups(node.children[0]),
		...collectDockGroups(node.children[1]),
	];
}

function findDockGroup(
	node: DockGroupNode,
	groupId: string,
): Extract<DockGroupNode, { kind: "group" }> | null {
	if (node.kind === "group") {
		return node.id === groupId ? node : null;
	}

	return (
		findDockGroup(node.children[0], groupId) ??
		findDockGroup(node.children[1], groupId)
	);
}

function updateDockGroup(
	node: DockGroupNode,
	groupId: string,
	updateGroup: (
		group: Extract<DockGroupNode, { kind: "group" }>,
	) => Extract<DockGroupNode, { kind: "group" }>,
): DockGroupNode {
	if (node.kind === "group") {
		return node.id === groupId ? updateGroup(node) : node;
	}

	return {
		...node,
		children: [
			updateDockGroup(node.children[0], groupId, updateGroup),
			updateDockGroup(node.children[1], groupId, updateGroup),
		],
	};
}

function removePanelFromDockGroupTree(
	node: DockGroupNode,
	panelId: PanelId,
): { node: DockGroupNode | null; removed: boolean } {
	if (node.kind === "group") {
		if (!node.panels.includes(panelId)) {
			return { node, removed: false };
		}

		const panels = node.panels.filter(
			(candidatePanelId) => candidatePanelId !== panelId,
		);

		if (panels.length === 0) {
			return { node: null, removed: true };
		}

		return {
			node: {
				...node,
				activePanel:
					node.activePanel === panelId ? panels[0] : node.activePanel,
				panels,
			},
			removed: true,
		};
	}

	const firstResult = removePanelFromDockGroupTree(node.children[0], panelId);

	if (firstResult.removed) {
		return {
			node: firstResult.node
				? { ...node, children: [firstResult.node, node.children[1]] }
				: inheritDockGroupFlex(node.children[1], node.flex),
			removed: true,
		};
	}

	const secondResult = removePanelFromDockGroupTree(node.children[1], panelId);

	if (secondResult.removed) {
		return {
			node: secondResult.node
				? { ...node, children: [node.children[0], secondResult.node] }
				: inheritDockGroupFlex(node.children[0], node.flex),
			removed: true,
		};
	}

	return { node, removed: false };
}

function addPanelToDockGroup(
	node: DockGroupNode,
	groupId: string,
	panelId: PanelId,
): DockGroupNode {
	return updateDockGroup(node, groupId, (group) => ({
		...group,
		activePanel: panelId,
		panels: [
			...group.panels.filter((candidate) => candidate !== panelId),
			panelId,
		],
	}));
}

function insertPanelNearDockGroup(
	node: DockGroupNode,
	targetGroupId: string,
	panelId: PanelId,
	zone: Exclude<DockGroupDropZone, "center">,
	newGroupId: string,
): DockGroupNode {
	if (node.kind === "group") {
		if (node.id !== targetGroupId) {
			return node;
		}

		const direction = zone === "left" || zone === "right" ? "row" : "column";
		const newGroup: DockGroupNode = {
			activePanel: panelId,
			flex: 0.34,
			id: newGroupId,
			kind: "group",
			panels: [panelId],
		};
		const targetGroup: DockGroupNode = { ...node, flex: 0.66 };
		const children: [DockGroupNode, DockGroupNode] =
			zone === "left" || zone === "top"
				? [newGroup, targetGroup]
				: [targetGroup, newGroup];

		return {
			children,
			direction,
			flex: node.flex ?? 1,
			id: `split-${targetGroupId}-${newGroupId}`,
			kind: "split",
		};
	}

	return {
		...node,
		children: [
			insertPanelNearDockGroup(
				node.children[0],
				targetGroupId,
				panelId,
				zone,
				newGroupId,
			),
			insertPanelNearDockGroup(
				node.children[1],
				targetGroupId,
				panelId,
				zone,
				newGroupId,
			),
		],
	};
}

function inheritDockGroupFlex(
	node: DockGroupNode,
	flex: number | undefined,
): DockGroupNode {
	return flex === undefined ? node : { ...node, flex };
}

function nextDockGroupId(node: DockGroupNode): string {
	const largestId = collectDockGroups(node).reduce((largest, group) => {
		const numericId = Number.parseInt(group.id.replace("group-", ""), 10);
		return Number.isNaN(numericId) ? largest : Math.max(largest, numericId);
	}, 0);

	return `group-${largestId + 1}`;
}

function serializeDockGroupTree(node: DockGroupNode): unknown {
	if (node.kind === "group") {
		return {
			activePanel: node.activePanel,
			flex: roundFlex(node.flex ?? 1),
			id: node.id,
			panels: node.panels,
		};
	}

	return {
		children: node.children.map(serializeDockGroupTree),
		direction: node.direction,
		flex: roundFlex(node.flex ?? 1),
		id: node.id,
	};
}

function dockGroupDropTargetFromPoint(
	pointerX: number,
	pointerY: number,
): { groupId: string; zone: DockGroupDropZone } | null {
	const groupElement = document
		.elementFromPoint(pointerX, pointerY)
		?.closest<HTMLElement>("[data-dock-group-id]");

	if (!groupElement?.dataset.dockGroupId) {
		return null;
	}

	return {
		groupId: groupElement.dataset.dockGroupId,
		zone: dockGroupDropZoneFromRect(
			groupElement.getBoundingClientRect(),
			pointerX,
			pointerY,
		),
	};
}

function dockGroupDropZoneFromRect(
	rect: DOMRect,
	pointerX: number,
	pointerY: number,
): DockGroupDropZone {
	const relativeX = (pointerX - rect.left) / rect.width;
	const relativeY = (pointerY - rect.top) / rect.height;
	const edgeSize = 0.24;

	if (relativeX < edgeSize) {
		return "left";
	}

	if (relativeX > 1 - edgeSize) {
		return "right";
	}

	if (relativeY < edgeSize) {
		return "top";
	}

	if (relativeY > 1 - edgeSize) {
		return "bottom";
	}

	return "center";
}

function dockGroupDropZoneClassName(zone: DockGroupDropZone): string {
	const base =
		"absolute grid place-items-center border border-dashed text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors";

	switch (zone) {
		case "left":
			return `${base} bottom-1 left-1 top-9 w-[22%]`;
		case "right":
			return `${base} bottom-1 right-1 top-9 w-[22%]`;
		case "top":
			return `${base} left-[24%] right-[24%] top-9 h-[22%]`;
		case "bottom":
			return `${base} bottom-1 left-[24%] right-[24%] h-[22%]`;
		case "center":
			return `${base} bottom-[28%] left-[26%] right-[26%] top-[36%]`;
	}
}

function dockTargetById(
	targets: DockTargetState[],
	targetId: DockTargetId,
): DockTargetState {
	const target = targets.find(
		(candidateTarget) => candidateTarget.id === targetId,
	);

	if (!target) {
		throw new Error(`Missing dock target ${targetId}`);
	}

	return target;
}

function cloneAreaNode(node: AreaNode): AreaNode {
	if (node.kind === "leaf") {
		return { ...node };
	}

	return {
		...node,
		children: [
			cloneAreaNode(node.children[0]),
			cloneAreaNode(node.children[1]),
		],
	};
}

function firstLeafId(node: AreaNode): string {
	if (node.kind === "leaf") {
		return node.id;
	}

	return firstLeafId(node.children[0]);
}

function collectAreaLeaves(
	node: AreaNode,
): Extract<AreaNode, { kind: "leaf" }>[] {
	if (node.kind === "leaf") {
		return [node];
	}

	return [
		...collectAreaLeaves(node.children[0]),
		...collectAreaLeaves(node.children[1]),
	];
}

function findAreaLeaf(
	node: AreaNode,
	areaId: string,
): Extract<AreaNode, { kind: "leaf" }> | null {
	if (node.kind === "leaf") {
		return node.id === areaId ? node : null;
	}

	return (
		findAreaLeaf(node.children[0], areaId) ??
		findAreaLeaf(node.children[1], areaId)
	);
}

function findAreaJoinPreview(
	node: AreaNode,
	areaId: string,
): AreaJoinPreview | null {
	if (node.kind === "leaf") {
		return null;
	}

	const [firstChild, secondChild] = node.children;

	if (firstChild.kind === "leaf" && firstChild.id === areaId) {
		const siblingLeaf = firstAreaLeaf(secondChild);
		return {
			direction: node.direction,
			selectedId: areaId,
			siblingEditor: siblingLeaf.editor,
			siblingId: siblingLeaf.id,
		};
	}

	if (secondChild.kind === "leaf" && secondChild.id === areaId) {
		const siblingLeaf = firstAreaLeaf(firstChild);
		return {
			direction: node.direction,
			selectedId: areaId,
			siblingEditor: siblingLeaf.editor,
			siblingId: siblingLeaf.id,
		};
	}

	return (
		findAreaJoinPreview(firstChild, areaId) ??
		findAreaJoinPreview(secondChild, areaId)
	);
}

function updateAreaLeaf(
	node: AreaNode,
	areaId: string,
	updateLeaf: (leaf: Extract<AreaNode, { kind: "leaf" }>) => AreaNode,
): AreaNode {
	if (node.kind === "leaf") {
		return node.id === areaId ? updateLeaf(node) : node;
	}

	return {
		...node,
		children: [
			updateAreaLeaf(node.children[0], areaId, updateLeaf),
			updateAreaLeaf(node.children[1], areaId, updateLeaf),
		],
	};
}

function updateAreaSplitFlex(
	node: AreaNode,
	splitId: string,
	firstFlex: number,
	secondFlex: number,
): AreaNode {
	if (node.kind === "leaf") {
		return node;
	}

	if (node.id === splitId) {
		return {
			...node,
			children: [
				{ ...node.children[0], flex: firstFlex },
				{ ...node.children[1], flex: secondFlex },
			],
		};
	}

	return {
		...node,
		children: [
			updateAreaSplitFlex(node.children[0], splitId, firstFlex, secondFlex),
			updateAreaSplitFlex(node.children[1], splitId, firstFlex, secondFlex),
		],
	};
}

function swapAreaLeafEditors(
	node: AreaNode,
	sourceAreaId: string,
	targetAreaId: string,
): AreaNode {
	if (sourceAreaId === targetAreaId) {
		return node;
	}

	const sourceLeaf = findAreaLeaf(node, sourceAreaId);
	const targetLeaf = findAreaLeaf(node, targetAreaId);

	if (!sourceLeaf || !targetLeaf) {
		return node;
	}

	return updateAreaLeaf(
		updateAreaLeaf(node, sourceAreaId, (leaf) => ({
			...leaf,
			editor: targetLeaf.editor,
		})),
		targetAreaId,
		(leaf) => ({
			...leaf,
			editor: sourceLeaf.editor,
		}),
	);
}

function removeAreaLeaf(
	node: AreaNode,
	areaId: string,
): { absorbedById?: string; node: AreaNode; removed: boolean } {
	if (node.kind === "leaf") {
		return { node, removed: false };
	}

	const [firstChild, secondChild] = node.children;

	if (firstChild.kind === "leaf" && firstChild.id === areaId) {
		return {
			absorbedById: firstAreaLeaf(secondChild).id,
			node: secondChild,
			removed: true,
		};
	}

	if (secondChild.kind === "leaf" && secondChild.id === areaId) {
		return {
			absorbedById: firstAreaLeaf(firstChild).id,
			node: firstChild,
			removed: true,
		};
	}

	const firstResult = removeAreaLeaf(firstChild, areaId);

	if (firstResult.removed) {
		return {
			node: {
				...node,
				children: [firstResult.node, secondChild],
			},
			removed: true,
			absorbedById: firstResult.absorbedById,
		};
	}

	const secondResult = removeAreaLeaf(secondChild, areaId);

	if (secondResult.removed) {
		return {
			node: {
				...node,
				children: [firstChild, secondResult.node],
			},
			removed: true,
			absorbedById: secondResult.absorbedById,
		};
	}

	return { node, removed: false };
}

function firstAreaLeaf(node: AreaNode): Extract<AreaNode, { kind: "leaf" }> {
	if (node.kind === "leaf") {
		return node;
	}

	return firstAreaLeaf(node.children[0]);
}

function nextAreaId(node: AreaNode): string {
	const largestId = collectAreaLeaves(node).reduce((largest, leaf) => {
		const numericId = Number.parseInt(leaf.id.replace("area-", ""), 10);
		return Number.isNaN(numericId) ? largest : Math.max(largest, numericId);
	}, 0);

	return `area-${largestId + 1}`;
}

function nextPanelId(panelId: PanelId): PanelId {
	const currentIndex = panelOrder.indexOf(panelId);
	return panelOrder[(currentIndex + 1) % panelOrder.length];
}

function serializeAreaTree(node: AreaNode): unknown {
	if (node.kind === "leaf") {
		return {
			editor: node.editor,
			flex: roundFlex(node.flex ?? 1),
			id: node.id,
		};
	}

	return {
		children: node.children.map(serializeAreaTree),
		direction: node.direction,
		flex: roundFlex(node.flex ?? 1),
		id: node.id,
	};
}

function clampFloatingPosition(
	position: FloatingPosition,
	containerRect: DOMRect,
	panelRect: DOMRect,
): FloatingPosition {
	const margin = 8;

	return {
		x: Math.min(
			Math.max(margin, position.x),
			Math.max(margin, containerRect.width - panelRect.width - margin),
		),
		y: Math.min(
			Math.max(margin, position.y),
			Math.max(margin, containerRect.height - panelRect.height - margin),
		),
	};
}

function clampFlex(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function roundFlex(value: number): number {
	return Number(value.toFixed(3));
}

function waveBars(seed: number) {
	const first = [
		18, 24, 20, 34, 42, 28, 54, 38, 26, 46, 58, 32, 24, 30, 48, 36, 22, 28, 40,
		52, 30, 24, 36, 44, 28, 20, 34, 50, 42, 24, 22, 30, 38, 46, 32, 26,
	];
	const second = [
		12, 16, 20, 18, 24, 28, 22, 20, 26, 30, 26, 22, 18, 24, 28, 32, 30, 24, 22,
		20, 18, 24, 26, 30, 28, 22, 18, 16, 20, 24, 28, 26, 22, 20, 18, 24,
	];
	const heights = seed === 0 ? first : second;

	return heights.map((height, position) => ({
		height,
		id: `${seed}-${position}-${height}`,
	}));
}
