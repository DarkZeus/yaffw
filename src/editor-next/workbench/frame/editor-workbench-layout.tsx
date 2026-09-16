import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { ReactNode } from "react";

/** Cinema keeps the selection full-width and the inspector beside the viewer.
 * CSS flattens this same tree on mobile so resizing never remounts media. */
export function EditorWorkbenchLayout({
	viewer,
	transport,
	selection,
	inspector,
}: {
	viewer: ReactNode;
	transport: ReactNode;
	selection: ReactNode;
	inspector?: ReactNode;
}) {
	return (
		<ResizablePanelGroup
			aria-label="Preview and selection layout"
			autoSaveId="editor-cinema-vertical"
			className="cinema-layout"
			direction="vertical"
		>
			<ResizablePanel
				className="cinema-top-pane"
				defaultSize={70}
				minSize={40}
				order={1}
				id="cinema-top"
			>
				<ResizablePanelGroup
					aria-label="Ready workbench layout"
					autoSaveId="editor-cinema-horizontal"
					className="cinema-top-layout"
					direction="horizontal"
				>
					<ResizablePanel
						className="cinema-viewer-pane"
						defaultSize={74}
						minSize={50}
						order={1}
						id="cinema-preview"
					>
						<div className="cinema-viewer">{viewer}</div>
						<div className="cinema-transport">{transport}</div>
					</ResizablePanel>
					{inspector && (
						<>
							<ResizableHandle
								aria-label="Resize inspector panel"
								className="cinema-resizer cinema-inspector-resizer"
							/>
							<ResizablePanel
								className="cinema-inspector-pane"
								defaultSize={26}
								minSize={22}
								maxSize={40}
								order={2}
								id="cinema-inspector"
							>
								{inspector}
							</ResizablePanel>
						</>
					)}
				</ResizablePanelGroup>
			</ResizablePanel>
			<ResizableHandle
				aria-label="Resize selection region"
				className="cinema-resizer cinema-selection-resizer"
			/>
			<ResizablePanel
				className="cinema-selection"
				defaultSize={30}
				minSize={26}
				order={2}
				id="cinema-selection"
			>
				{selection}
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
