import {
	type Ref,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

export function EditableName({
	name,
	onRename,
	label,
	className,
	ref,
}: {
	name: string;
	onRename: (name: string) => void;
	label: string;
	className: string;
	ref?: Ref<{ edit: () => void }>;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(name);
	const input = useRef<HTMLInputElement>(null);
	const cancelled = useRef(false);
	useEffect(() => {
		if (editing) {
			input.current?.focus();
			input.current?.select();
		}
	}, [editing]);
	const begin = () => {
		cancelled.current = false;
		setDraft(name);
		setEditing(true);
	};
	useImperativeHandle(ref, () => ({ edit: begin }));
	const save = () => {
		const next = draft.trim();
		if (!cancelled.current && next && next !== name) onRename(next);
		setEditing(false);
	};
	if (editing)
		return (
			<input
				ref={input}
				className={`${className}-input`}
				aria-label={label}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={save}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") {
						e.preventDefault();
						save();
					} else if (e.key === "Escape") {
						e.preventDefault();
						cancelled.current = true;
						setEditing(false);
					}
				}}
			/>
		);
	return (
		<button
			type="button"
			className={className}
			aria-label={label}
			title="Double-click to rename · Enter or F2 when focused"
			onDoubleClick={begin}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === "F2") {
					e.preventDefault();
					e.stopPropagation();
					begin();
				}
			}}
		>
			{name}
		</button>
	);
}
