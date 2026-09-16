import { Film, FolderOpen, Music2, Plus, Search, Type } from "lucide-react";
import { useRef, useState } from "react";
import { time } from "./model";
import type { Editor } from "./use-editor";
export function MediaLibrary({ editor }: { editor: Editor }) {
	const input = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState("all");
	const assets = editor.assets.filter(
		(a) =>
			a.kind !== "title" &&
			(filter === "all" || a.kind === filter) &&
			a.name.toLowerCase().includes(query.toLowerCase()),
	);
	return (
		<aside className="media-library panel">
			<div className="panel-header">
				<strong>
					<FolderOpen size={14} /> Media pool
				</strong>
				<button
					type="button"
					className="icon"
					aria-label="Import media"
					disabled={editor.importing}
					onClick={() => input.current?.click()}
				>
					<Plus size={16} />
				</button>
			</div>
			<input
				ref={input}
				type="file"
				hidden
				multiple
				accept="video/*,audio/*,image/*"
				onChange={(e) => {
					void editor.importFiles(Array.from(e.target.files ?? []));
					e.target.value = "";
				}}
			/>
			<div className="media-search">
				<Search size={13} />
				<input
					aria-label="Search media"
					placeholder="Search media…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>
			<div className="media-filters">
				{[
					["all", "All"],
					["video", "Video"],
					["audio", "Audio"],
					["image", "Images"],
				].map(([value, label]) => (
					<button
						type="button"
						key={value}
						aria-pressed={filter === value}
						onClick={() => setFilter(value)}
					>
						{label}
					</button>
				))}
			</div>
			<div className="asset-scroll">
				<div className="asset-grid">
					{assets.map((asset) => (
						<button
							type="button"
							key={asset.id}
							className={`asset-card ${editor.source.id === asset.id ? "selected" : ""}`}
							aria-label={`Source ${asset.name}`}
							aria-pressed={editor.source.id === asset.id}
							draggable
							onDragStart={(e) => {
								e.dataTransfer.setData("application/yaffw-asset", asset.id);
								e.dataTransfer.effectAllowed = "copy";
							}}
							onClick={() => editor.selectSource(asset.id)}
							onDoubleClick={() => editor.addAsset(asset, "append")}
						>
							<div
								className={`asset-picture ${asset.kind === "audio" ? "audio-art" : ""}`}
							>
								{asset.poster ? (
									<img src={asset.poster} alt="" />
								) : (
									<Music2 size={28} />
								)}
								<span>{time(asset.duration)}</span>
							</div>
							<div className="asset-name">
								{asset.kind === "audio" ? (
									<Music2 size={11} />
								) : (
									<Film size={11} />
								)}
								<span>{asset.name}</span>
							</div>
							<small>
								{asset.kind === "audio"
									? "Audio"
									: asset.kind === "image"
										? "Still image"
										: "Video"}
							</small>
						</button>
					))}
				</div>
				{!assets.length && (
					<p className="empty-note">No media matches this search.</p>
				)}
				<button
					type="button"
					className="import-media"
					onClick={() => input.current?.click()}
					disabled={editor.importing}
				>
					<Plus size={14} />
					{editor.importing ? "Opening media…" : "Import media"}
				</button>
				<p className="pool-note">
					Choose media, then insert into the timeline.
					<br />
					Double-click to append.
				</p>
			</div>
			<div className="library-bottom">
				<button type="button" onClick={() => editor.addTitle()}>
					<Type size={14} /> Add title
				</button>
				<span>{editor.assets.length - 1} assets</span>
			</div>
		</aside>
	);
}
