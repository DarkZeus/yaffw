import { Button } from "@/components/ui/button";
import {
	ChevronDown,
	Film,
	Link2,
	Magnet,
	MousePointer2,
	Music2,
	Scissors,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { EditableName } from "./editable-name";
import { FRAME, end } from "./model";
import type { Editor } from "./use-editor";

export function Disclosure({
	label,
	children,
	icon,
}: { label: string; children: ReactNode; icon?: ReactNode }) {
	const id = useId();
	return (
		<div className="timeline-disclosure">
			<Button variant="ghost" popoverTarget={id} aria-label={label}>
				{icon ?? label}
			</Button>
			<div
				id={id}
				popover="auto"
				className="control-popover"
				onToggle={(e) => {
					if (!e.currentTarget.matches(":popover-open")) return;
					const anchor =
						e.currentTarget.previousElementSibling?.getBoundingClientRect();
					if (!anchor) return;
					e.currentTarget.style.left = `${Math.max(
						12,
						Math.min(
							anchor.left,
							window.innerWidth - e.currentTarget.offsetWidth - 12,
						),
					)}px`;
					e.currentTarget.style.top = `${Math.max(
						12,
						Math.min(
							anchor.bottom + 6,
							window.innerHeight - e.currentTarget.offsetHeight - 12,
						),
					)}px`;
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") e.currentTarget.hidePopover();
				}}
				onClick={(e) => {
					if ((e.target as HTMLElement).closest("button"))
						e.currentTarget.hidePopover();
				}}
			>
				{children}
			</div>
		</div>
	);
}
export function TimelineToolbar({
	editor,
	openMedia,
	openProperties,
}: {
	editor: Editor;
	openMedia: () => void;
	openProperties: () => void;
}) {
	const sequenceName = useRef<{ edit: () => void }>(null);
	const canSplit = editor.picked.some(
		(c) =>
			editor.playhead - c.start >= FRAME && end(c) - editor.playhead >= FRAME,
	);
	const action = (name: string, run: () => void, disabled = false) => (
		<Button key={name} variant="ghost" onClick={run} disabled={disabled}>
			{name}
		</Button>
	);
	return (
		<div
			className="sequence-toolbar"
			role="toolbar"
			aria-label="Sequence editing tools"
		>
			<div className="sequence-identity-control">
				<EditableName
					ref={sequenceName}
					className="sequence-name"
					label="Rename sequence"
					name={editor.state.name}
					onRename={(name) =>
						editor.commit({ ...editor.state, name }, "Sequence renamed", false)
					}
				/>
				<Disclosure label="Sequence actions" icon={<ChevronDown size={14} />}>
					{action("Rename", () => sequenceName.current?.edit())}
					{action("Save sequence", editor.download)}
				</Disclosure>
			</div>
			<Disclosure label="Add">
				{action("Add clips", openMedia)}
				{action("Add title", editor.addTitle)}
				{action("Add marker", editor.marker)}
			</Disclosure>
			<div className="timeline-tool-group">
				<Button
					variant="ghost"
					className="cinema-transport-button cinema-toggle-button"
					aria-label="Selection tool"
					aria-pressed={editor.tool === "select"}
					onClick={() => editor.setTool("select")}
				>
					<MousePointer2 size={16} />
				</Button>
				<Button
					variant="ghost"
					className="cinema-transport-button cinema-toggle-button"
					aria-label="Blade tool"
					aria-pressed={editor.tool === "blade"}
					onClick={() => editor.setTool("blade")}
				>
					<Scissors size={16} />
				</Button>
			</div>
			<Disclosure label="Clip actions">
				{action("Split at playhead", () => editor.splitAt(), !canSplit)}
				{action("Duplicate", editor.duplicate, !editor.picked.length)}
				{action("Delete", editor.remove, !editor.picked.length)}
				{action("Clip properties", openProperties, !editor.selected)}
				{action(
					"Unlink audio / video",
					editor.unlink,
					!editor.selected?.linkId,
				)}
			</Disclosure>
			<Disclosure label="Edit">
				{action("Undo", editor.undo, !editor.canUndo)}
				{action("Redo", editor.redo, !editor.canRedo)}
				<Button
					variant="ghost"
					aria-pressed={editor.ripple}
					onClick={() => editor.setRipple(!editor.ripple)}
				>
					Ripple delete: {editor.ripple ? "On" : "Off"}
				</Button>
			</Disclosure>
			<div className="timeline-tool-group timeline-view">
				<Button
					variant="ghost"
					className="cinema-transport-button cinema-toggle-button"
					aria-label="Linked selection"
					aria-pressed={editor.linked}
					onClick={() => editor.setLinked(!editor.linked)}
				>
					<Link2 size={16} />
				</Button>
				<Button
					variant="ghost"
					className="cinema-transport-button cinema-toggle-button"
					aria-label="Snapping"
					aria-pressed={editor.snap}
					onClick={() => editor.setSnap(!editor.snap)}
				>
					<Magnet size={16} />
				</Button>
			</div>
			<input
				type="range"
				aria-label="Timeline zoom"
				min={1}
				max={5}
				step={0.5}
				value={editor.zoom}
				onChange={(e) => editor.setZoom(Number(e.target.value))}
			/>
			{action("Fit", () => editor.setZoom(1))}
		</div>
	);
}
function AddTrackControl({ editor }: { editor: Editor }) {
	const [expanded, setExpanded] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const audio = useRef<HTMLButtonElement>(null);
	return (
		<div
			className="add-track-control"
			onPointerLeave={(e) => {
				if (
					e.pointerType === "mouse" &&
					!e.currentTarget.querySelector(":focus-visible")
				)
					setExpanded(false);
			}}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false);
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape" && expanded) {
					e.preventDefault();
					e.stopPropagation();
					setExpanded(false);
					requestAnimationFrame(() => trigger.current?.focus());
				}
			}}
		>
			{expanded ? (
				<fieldset className="add-track-choices" aria-label="Choose track type">
					<Button
						ref={audio}
						variant="ghost"
						aria-label="Add audio track"
						title="Add audio track"
						onClick={() => editor.addTrack("audio")}
					>
						<Music2 size={16} />
					</Button>
					<Button
						variant="ghost"
						aria-label="Add video track"
						title="Add video track"
						onClick={() => editor.addTrack("video")}
					>
						<Film size={16} />
					</Button>
				</fieldset>
			) : (
				<Button
					ref={trigger}
					variant="ghost"
					aria-expanded={false}
					onClick={(e) => {
						setExpanded(true);
						if (e.detail === 0)
							requestAnimationFrame(() => audio.current?.focus());
					}}
				>
					Add track
				</Button>
			)}
		</div>
	);
}
export function TimelineFooter({ editor }: { editor: Editor }) {
	return (
		<div className="timeline-footer">
			<AddTrackControl editor={editor} />
			<output>{editor.message}</output>
			<Disclosure label="Shortcuts">
				<dl>
					<dt>Shift-click</dt>
					<dd>Select multiple clips</dd>
					<dt>B / V</dt>
					<dd>Blade / Selection tool</dd>
					<dt>S</dt>
					<dd>Split at playhead</dd>
					<dt>M</dt>
					<dd>Add marker</dd>
					<dt>Space</dt>
					<dd>Play / Pause</dd>
					<dt>⌘ / Ctrl Z</dt>
					<dd>Undo</dd>
				</dl>
			</Disclosure>
		</div>
	);
}
