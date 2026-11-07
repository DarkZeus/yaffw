import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	type PointerEvent,
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
} from "react";
import {
	type TabNode,
	type TabRenderProps,
	useParentTabset,
	useParentTabsetState,
	useParentWorkspace,
} from "react-resizable-panels";
import {
	type WorkbenchPanelId,
	createDefaultWorkbenchLayout,
	workbenchPanelTitles,
} from "./workbench-layout-model";

type PanelContent = Partial<Record<WorkbenchPanelId, ReactNode>>;
type DragHandler = NonNullable<TabRenderProps["onPointerDown"]>;
type PanelContext = {
	panels: PanelContent;
	dragHandlers: Map<string, DragHandler>;
	disabled: boolean;
	altPressed: boolean;
};
const PanelsContext = createContext<PanelContext | null>(null);

export function WorkbenchPanelsProvider({
	panels,
	disabled,
	children,
}: {
	panels: PanelContent;
	disabled: boolean;
	children: ReactNode;
}) {
	const [dragHandlers] = useState(() => new Map<string, DragHandler>());
	const [altPressed, setAltPressed] = useState(false);
	useEffect(() => {
		function syncModifier(event: KeyboardEvent | globalThis.PointerEvent) {
			setAltPressed(event.altKey);
		}
		function clearModifier() {
			setAltPressed(false);
		}
		// Pointer events reconcile modifier changes made outside this window.
		window.addEventListener("keydown", syncModifier, true);
		window.addEventListener("keyup", syncModifier, true);
		window.addEventListener("pointermove", syncModifier, true);
		window.addEventListener("blur", clearModifier);
		document.addEventListener("visibilitychange", clearModifier);
		return () => {
			window.removeEventListener("keydown", syncModifier, true);
			window.removeEventListener("keyup", syncModifier, true);
			window.removeEventListener("pointermove", syncModifier, true);
			window.removeEventListener("blur", clearModifier);
			document.removeEventListener("visibilitychange", clearModifier);
		};
	}, []);
	const value = useMemo(
		() => ({ panels, dragHandlers, disabled, altPressed }),
		[panels, dragHandlers, disabled, altPressed],
	);
	return <PanelsContext value={value}>{children}</PanelsContext>;
}

export function WorkbenchTab({
	tab,
	tabProps,
}: { tab: TabNode<null>; tabProps: TabRenderProps }) {
	const dragHandlers = useContext(PanelsContext)?.dragHandlers;
	const handler = tabProps.onPointerDown;
	useLayoutEffect(() => {
		if (!dragHandlers || !handler) return;
		dragHandlers.set(tab.id, handler);
		return () => {
			dragHandlers.delete(tab.id);
		};
	}, [dragHandlers, handler, tab.id]);
	return <div {...tabProps}>{tab.title}</div>;
}

export function WorkbenchPanel({ id }: { id: WorkbenchPanelId }) {
	const context = useContext(PanelsContext);
	const parent = useParentTabset();
	const state = useParentTabsetState();
	const workspace = useParentWorkspace<null>();

	function beginPanelDrag(event: PointerEvent<HTMLElement>) {
		if (!context || context.disabled || !event.altKey || event.button !== 0)
			return;
		const handler = context.dragHandlers.get(id);
		if (!handler) return;
		event.preventDefault();
		event.stopPropagation();
		// Workspace's public tab handler owns capture, drag thresholds, docking and Escape.
		// Treat the panel as the target so Alt-drag also works over its buttons.
		handler({ ...event, target: event.currentTarget });
	}

	return (
		<ContextMenu disabled={context?.disabled}>
			<ContextMenuTrigger
				className="workbench-panel-body select-auto"
				data-workbench-panel={id}
				data-layout-drag-ready={
					(context?.altPressed && !context.disabled) || undefined
				}
				onPointerDownCapture={beginPanelDrag}
				onClickCapture={(event) => {
					if (!event.altKey || context?.disabled) return;
					event.preventDefault();
					event.stopPropagation();
				}}
				onContextMenuCapture={(event) => {
					if (
						event.target instanceof Element &&
						event.target.closest('input, textarea, [contenteditable="true"]')
					)
						event.stopPropagation();
				}}
			>
				{context?.panels[id]}
			</ContextMenuTrigger>
			<ContextMenuContent
				aria-label={`${workbenchPanelTitles[id]} layout`}
				className="workbench dark min-w-56"
			>
				<ContextMenuGroup>
					<ContextMenuLabel>{workbenchPanelTitles[id]}</ContextMenuLabel>
					<ContextMenuItem
						disabled={state?.isRoot}
						onClick={() =>
							state?.isMaximized ? parent?.restore() : parent?.maximize()
						}
					>
						{state?.isMaximized
							? "Restore panel group"
							: "Maximize panel group"}
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() =>
							workspace?.setModel(
								createDefaultWorkbenchLayout(
									!!context && "media" in context.panels,
								),
							)
						}
					>
						Reset workbench layout
					</ContextMenuItem>
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<p className="px-1.5 py-1 text-xs text-muted-foreground">
					Alt-drag content to move this panel
				</p>
			</ContextMenuContent>
		</ContextMenu>
	);
}
