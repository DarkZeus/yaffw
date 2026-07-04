// Throwaway prototype: Vidstack default layout inside the YAFFW workbench shell.
import {
	BadgeCheck,
	FileVideo,
	Gauge,
	MonitorPlay,
	Scissors,
	Subtitles,
} from "lucide-react";
import {
	type ChangeEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type {
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import { DEFAULT_OUTPUT_PROFILE } from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import {
	type ChapterOption,
	MediaPlayer,
	type MediaPlayerInstance,
	MediaProvider,
	type MediaProviderAdapter,
	Menu,
	type PlayerSrc,
	Poster,
	Thumbnail,
	Track,
	isHLSProvider,
	useChapterOptions,
	useMediaStore,
	useVideoQualityOptions,
} from "@vidstack/react";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/audio.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import {
	DefaultTooltip,
	DefaultVideoLayout,
	defaultLayoutIcons,
	useDefaultLayoutContext,
} from "@vidstack/react/player/layouts/default";

import { formatMediaTime } from "../../media-time/format/media-time-presentation";
import { EditorWorkbenchFrame } from "../../workbench/frame/editor-workbench";

type PrototypeSourceKind = "sample-mp4" | "sample-hls" | "local-file";

type LocalSource = {
	label: string;
	type: LocalMediaMimeType;
	url: string;
};

type LocalMediaMimeType =
	| "application/dash+xml"
	| "application/mpegurl"
	| "application/vnd.apple.mpegurl"
	| "application/x-mpegurl"
	| "audio/flac"
	| "audio/mpeg"
	| "audio/mp3"
	| "audio/object"
	| "audio/ogg"
	| "audio/webm"
	| "audio/x-mpegurl"
	| "video/mp4"
	| "video/object"
	| "video/ogg"
	| "video/webm"
	| "video/x-mpegurl";

type PlayerTelemetry = {
	currentTime: number;
	duration: number;
	error: string | null;
	paused: boolean;
	provider: string;
	source: string;
	viewType: string;
};

type ChapterSnapshot = {
	durationText: string;
	endUs: MediaTimeUs;
	label: string;
	selected: boolean;
	startTimeText: string;
	startUs: MediaTimeUs;
	value: string;
};

type QualitySnapshot = {
	autoSelected: boolean;
	bitrateText: string | null;
	height: number | null;
	label: string;
	selected: boolean;
	value: string;
	width: number | null;
};

const sampleMedia = {
	chapters: "https://files.vidstack.io/sprite-fight/chapters.vtt",
	hls: "https://files.vidstack.io/sprite-fight/hls/stream.m3u8",
	mp4: "https://files.vidstack.io/sprite-fight/720p.mp4",
	poster: "https://files.vidstack.io/sprite-fight/poster.webp",
	subtitlesEnglish: "https://files.vidstack.io/sprite-fight/subs/english.vtt",
	subtitlesSpanish: "https://files.vidstack.io/sprite-fight/subs/spanish.vtt",
	thumbnails: "https://files.vidstack.io/sprite-fight/thumbnails.vtt",
};

const sourceModes: Array<{
	description: string;
	key: PrototypeSourceKind;
	label: string;
}> = [
	{
		description: "Single-file browser preview",
		key: "sample-mp4",
		label: "Sample MP4",
	},
	{
		description: "Adaptive stream pathway",
		key: "sample-hls",
		label: "Sample HLS",
	},
	{
		description: "Blob URL from file input",
		key: "local-file",
		label: "Local file",
	},
];

const initialSelection: Selection = {
	endUs: 10_000_000,
	startUs: 3_200_000,
};

const prototypeAsset: ReadyMediaAsset = {
	durationUs: 604_000_000,
	exportCapability: {
		profile: DEFAULT_OUTPUT_PROFILE,
		supported: true,
	},
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "vidstack-preview-prototype",
	label: "Vidstack preview spike",
	provenance: {
		fileName: "sprite-fight-or-local-file.mp4",
		mimeType: "video/mp4",
		sizeBytes: 0,
	},
	tracks: {
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "prototype-audio",
				kind: "audio",
				label: "Prototype stereo mix",
				sampleRate: 48_000,
			},
		],
		video: [
			{
				codec: "h264",
				height: 720,
				id: "prototype-video",
				kind: "video",
				label: "Prototype video",
				width: 1280,
			},
		],
	},
};

const prototypeRuntime: RuntimeSupport = {
	capabilities: {
		fileApi: true,
		mediaSource: true,
		objectUrl: true,
		videoDecoder: true,
		videoEncoder: true,
	},
	missing: [],
	supported: true,
};

const initialTelemetry: PlayerTelemetry = {
	currentTime: 0,
	duration: 0,
	error: null,
	paused: true,
	provider: "none",
	source: sampleMedia.mp4,
	viewType: "unknown",
};

export function VidstackPreviewPrototype() {
	const playerRef = useRef<MediaPlayerInstance>(null);
	const localSourceUrlRef = useRef<string | null>(null);
	const [sourceKind, setSourceKind] =
		useState<PrototypeSourceKind>("sample-mp4");
	const [localSource, setLocalSource] = useState<LocalSource | null>(null);
	const [selection, setSelection] = useState<Selection>(initialSelection);
	const [selectionSource, setSelectionSource] = useState("initial");
	const [chapters, setChapters] = useState<ChapterSnapshot[]>([]);
	const [qualities, setQualities] = useState<QualitySnapshot[]>([]);
	const [telemetry, setTelemetry] = useState<PlayerTelemetry>(initialTelemetry);

	const source = useMemo(
		() => resolvePlayerSource(sourceKind, localSource),
		[sourceKind, localSource],
	);
	const title =
		sourceKind === "local-file"
			? (localSource?.label ?? "Local media file")
			: sourceKind === "sample-hls"
				? "Vidstack sample HLS"
				: "Vidstack sample MP4";
	const useSampleTextTracks = sourceKind !== "local-file";

	const handleSourceKindChange = useCallback(
		(nextKind: PrototypeSourceKind) => {
			setSourceKind(nextKind);
			if (nextKind !== "local-file" || localSource) {
				return;
			}
			setTelemetry((current) => ({
				...current,
				source: "Choose a local media file",
			}));
		},
		[localSource],
	);

	const handleLocalFileChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) {
				return;
			}
			if (localSourceUrlRef.current) {
				URL.revokeObjectURL(localSourceUrlRef.current);
			}
			const url = URL.createObjectURL(file);
			localSourceUrlRef.current = url;
			setLocalSource({
				label: file.name,
				type: normalizeLocalMediaType(file),
				url,
			});
			setSourceKind("local-file");
			setChapters([]);
			setSelection({
				endUs: 0,
				startUs: 0,
			});
			setSelectionSource("local file");
		},
		[],
	);

	useEffect(
		() => () => {
			if (localSourceUrlRef.current) {
				URL.revokeObjectURL(localSourceUrlRef.current);
			}
		},
		[],
	);

	const handlePlayerChapterJump = useCallback((chapter: ChapterSnapshot) => {
		setSelection({
			endUs: chapter.endUs,
			startUs: chapter.startUs,
		});
		setSelectionSource(chapter.label);
	}, []);

	const handleProviderChange = useCallback(
		(provider: MediaProviderAdapter | null) => {
			if (isHLSProvider(provider)) {
				provider.config = {
					lowLatencyMode: false,
				};
			}
			setTelemetry((current) => ({
				...current,
				provider: provider?.type ?? "none",
			}));
		},
		[],
	);

	return (
		<EditorWorkbenchFrame
			activeAsset={prototypeAsset}
			runtime={prototypeRuntime}
			status="ready"
		>
			<section
				aria-label="Vidstack preview prototype"
				className="grid min-h-[calc(100vh-5rem)] grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[16.25rem_minmax(30rem,1fr)_20rem] xl:grid-rows-[minmax(0,1fr)_7.5rem] xl:gap-0 xl:overflow-hidden"
			>
				<PrototypeSourcePanel
					localSource={localSource}
					onLocalFileChange={handleLocalFileChange}
					onSourceKindChange={handleSourceKindChange}
					sourceKind={sourceKind}
				/>
				<section
					aria-label="Vidstack player region"
					className="grid min-h-[26rem] min-w-0 grid-rows-[2.625rem_minmax(0,1fr)] overflow-hidden border border-workbench-border bg-workbench-viewer xl:col-start-2 xl:row-start-1 xl:min-h-0 xl:border-y-0"
				>
					<div className="flex min-w-0 items-center justify-between gap-3 border-b border-workbench-border bg-workbench-viewer/95 px-3">
						<div className="flex min-w-0 items-center gap-2">
							<MonitorPlay
								aria-hidden="true"
								className="size-4 shrink-0 text-workbench-progress"
							/>
							<div className="min-w-0">
								<h2 className="truncate text-sm font-semibold">
									Vidstack Default Layout
								</h2>
								<p className="truncate text-[11px] text-muted-foreground">
									{title}
								</p>
							</div>
						</div>
						<Badge className="rounded border-workbench-progress/45 bg-workbench-progress/15 text-workbench-progress">
							{telemetry.provider}
						</Badge>
					</div>
					<div className="min-h-0 min-w-0 overflow-hidden bg-black">
						<MediaPlayer
							aria-label="Vidstack preview prototype player"
							aspectRatio="16/9"
							className="h-full w-full overflow-hidden bg-black text-white [--media-brand:var(--workbench-progress)] [--media-focus-ring-color:var(--workbench-focus)]"
							crossOrigin
							onError={(error) => {
								setTelemetry((current) => ({
									...current,
									error: String(error),
								}));
							}}
							onProviderChange={handleProviderChange}
							playsInline
							ref={playerRef}
							src={source}
							title={title}
						>
							<MediaProvider>
								{sourceKind !== "local-file" ? (
									<Poster
										alt="Vidstack sample video poster"
										className="absolute inset-0 block h-full w-full object-cover opacity-100 transition-opacity data-[hidden]:opacity-0"
										src={sampleMedia.poster}
									/>
								) : null}
								{useSampleTextTracks ? <SampleTextTracks /> : null}
							</MediaProvider>
							<VidstackStateBridge
								onChaptersChange={setChapters}
								onQualitiesChange={setQualities}
								onTelemetryChange={setTelemetry}
							/>
							<DefaultVideoLayout
								icons={defaultLayoutIcons}
								slots={{
									chaptersMenu: useSampleTextTracks ? (
										<PrototypeChaptersMenu
											onChapterSelected={handlePlayerChapterJump}
										/>
									) : null,
								}}
								thumbnails={
									useSampleTextTracks ? sampleMedia.thumbnails : undefined
								}
							/>
						</MediaPlayer>
					</div>
				</section>
				<PrototypeInspector
					chapters={chapters}
					qualities={qualities}
					selection={selection}
					selectionSource={selectionSource}
					telemetry={telemetry}
					useSampleTextTracks={useSampleTextTracks}
				/>
				<PrototypeSelectionTimeline
					selection={selection}
					selectionSource={selectionSource}
					telemetry={telemetry}
				/>
			</section>
		</EditorWorkbenchFrame>
	);
}

function PrototypeSourcePanel({
	localSource,
	onLocalFileChange,
	onSourceKindChange,
	sourceKind,
}: {
	localSource: LocalSource | null;
	onLocalFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onSourceKindChange: (sourceKind: PrototypeSourceKind) => void;
	sourceKind: PrototypeSourceKind;
}) {
	return (
		<aside
			aria-label="Vidstack source controls"
			className="flex min-w-0 flex-col overflow-hidden border border-workbench-border bg-workbench-inspector xl:col-start-1 xl:row-start-1 xl:min-h-0 xl:border-y-0 xl:border-l-0"
		>
			<PanelHeader
				icon={<FileVideo aria-hidden="true" className="size-4" />}
				kicker="Prototype"
				title="Source"
			/>
			<div className="grid gap-3 overflow-y-auto p-3">
				<div className="grid gap-2">
					{sourceModes.map((mode) => (
						<button
							className={`grid min-h-[3.25rem] min-w-0 rounded border p-2 text-left transition-colors ${
								sourceKind === mode.key
									? "border-workbench-progress/60 bg-workbench-progress/15 text-foreground"
									: "border-workbench-border bg-workbench-lane text-muted-foreground hover:bg-workbench-hover hover:text-foreground"
							}`}
							key={mode.key}
							onClick={() => {
								onSourceKindChange(mode.key);
							}}
							type="button"
						>
							<span className="truncate text-sm font-medium">{mode.label}</span>
							<span className="truncate text-[11px]">{mode.description}</span>
						</button>
					))}
				</div>
				<label
					className="grid gap-1.5 text-xs font-medium"
					htmlFor="vidstack-prototype-local-file"
				>
					<span className="text-muted-foreground">Local file</span>
					<Input
						accept="video/*,audio/*,.m3u8,.mpd"
						className="h-9 rounded border-workbench-border bg-workbench-viewer text-xs file:mr-2 file:rounded file:border-0 file:bg-workbench-progress file:px-2 file:py-1 file:text-workbench-selected-foreground"
						id="vidstack-prototype-local-file"
						onChange={onLocalFileChange}
						type="file"
					/>
				</label>
				<div className="grid gap-2 rounded border border-workbench-border bg-workbench-lane p-2 text-xs">
					<Row label="Selected source" value={sourceKind} />
					<Row label="Local blob" value={localSource?.label ?? "none"} />
				</div>
				<div className="grid gap-2 rounded border border-workbench-border bg-workbench-lane p-2 text-xs text-muted-foreground">
					<div className="flex items-center gap-2 text-foreground">
						<BadgeCheck
							aria-hidden="true"
							className="size-3.5 text-workbench-progress"
						/>
						<span className="font-medium">Spike checks</span>
					</div>
					<p>
						Default Layout chrome, HLS provider path, subtitle menu, chapter
						menu, quality menu surface, and player-side Selection bridge.
					</p>
				</div>
			</div>
		</aside>
	);
}

function PrototypeInspector({
	chapters,
	qualities,
	selection,
	selectionSource,
	telemetry,
	useSampleTextTracks,
}: {
	chapters: ChapterSnapshot[];
	qualities: QualitySnapshot[];
	selection: Selection;
	selectionSource: string;
	telemetry: PlayerTelemetry;
	useSampleTextTracks: boolean;
}) {
	const selectedQuality = qualities.find((quality) => quality.selected);

	return (
		<aside
			aria-label="Vidstack integration inspector"
			className="flex min-w-0 flex-col overflow-hidden border border-workbench-border bg-workbench-inspector xl:col-start-3 xl:row-start-1 xl:min-h-0 xl:border-y-0 xl:border-r-0"
		>
			<PanelHeader
				icon={<Gauge aria-hidden="true" className="size-4" />}
				kicker="State"
				title="Player"
			/>
			<div className="grid gap-3 overflow-y-auto p-3">
				<section className="grid gap-2 rounded border border-workbench-border bg-workbench-lane p-2 text-xs">
					<Row
						label="Current time"
						value={formatSeconds(telemetry.currentTime)}
					/>
					<Row label="Duration" value={formatSeconds(telemetry.duration)} />
					<Row label="Paused" value={telemetry.paused ? "yes" : "no"} />
					<Row label="View type" value={telemetry.viewType} />
					<Row label="Provider" value={telemetry.provider} />
				</section>
				<section className="grid gap-2 rounded border border-workbench-border bg-workbench-lane p-2 text-xs">
					<div className="flex items-center justify-between gap-2">
						<div className="flex min-w-0 items-center gap-2">
							<Subtitles
								aria-hidden="true"
								className="size-3.5 text-workbench-progress"
							/>
							<h3 className="truncate font-medium">Text tracks</h3>
						</div>
						<Badge className="rounded border-workbench-border bg-workbench-hover text-[10px] text-muted-foreground">
							{useSampleTextTracks ? "sample" : "local"}
						</Badge>
					</div>
					<Row label="Chapters" value={String(chapters.length)} />
					<Row
						label="Subtitles"
						value={useSampleTextTracks ? "en, es" : "none"}
					/>
				</section>
				<section className="grid gap-2 rounded border border-workbench-border bg-workbench-lane p-2 text-xs">
					<div className="flex items-center justify-between gap-2">
						<h3 className="truncate font-medium">Quality menu</h3>
						<Badge className="rounded border-workbench-border bg-workbench-hover text-[10px] text-muted-foreground">
							{qualities.length}
						</Badge>
					</div>
					<Row
						label="Selected"
						value={selectedQuality?.label ?? "native/source default"}
					/>
					<div className="grid gap-1">
						{qualities.length > 0 ? (
							qualities.map((quality) => (
								<div
									className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded border border-workbench-border bg-workbench-viewer px-2 py-1"
									key={quality.value}
								>
									<span className="truncate">{quality.label}</span>
									<span className="font-mono text-muted-foreground">
										{quality.bitrateText ?? "auto"}
									</span>
								</div>
							))
						) : (
							<p className="text-muted-foreground">
								No adaptive quality list for this source yet.
							</p>
						)}
					</div>
				</section>
				<section className="grid gap-2 rounded border border-workbench-border bg-workbench-lane p-2 text-xs">
					<div className="flex items-center gap-2">
						<Scissors
							aria-hidden="true"
							className="size-3.5 text-workbench-selected"
						/>
						<h3 className="font-medium">Selection bridge</h3>
					</div>
					<Row label="Start" value={formatMediaTime(selection.startUs)} />
					<Row label="End" value={formatMediaTime(selection.endUs)} />
					<Row label="Source" value={selectionSource} />
					<Row
						label="Length"
						value={formatMediaTime(
							Math.max(0, selection.endUs - selection.startUs),
						)}
					/>
				</section>
				{telemetry.error ? (
					<section className="rounded border border-workbench-destructive/50 bg-workbench-destructive/15 p-2 text-xs text-destructive-foreground">
						{telemetry.error}
					</section>
				) : null}
			</div>
		</aside>
	);
}

function PrototypeSelectionTimeline({
	selection,
	selectionSource,
	telemetry,
}: {
	selection: Selection;
	selectionSource: string;
	telemetry: PlayerTelemetry;
}) {
	const durationUs = Math.max(
		1,
		telemetry.duration > 0
			? Math.round(telemetry.duration * 1_000_000)
			: prototypeAsset.durationUs,
	);
	const playheadPercent = clampPercent(
		(telemetry.currentTime / Math.max(1, telemetry.duration)) * 100,
	);
	const startPercent = clampPercent((selection.startUs / durationUs) * 100);
	const endPercent = clampPercent((selection.endUs / durationUs) * 100);
	const selectionWidthPercent = Math.max(0.75, endPercent - startPercent);

	return (
		<section
			aria-label="Selection timeline"
			className="grid min-h-[7.5rem] min-w-0 grid-rows-[2.625rem_minmax(0,1fr)] overflow-hidden border border-workbench-border bg-workbench-timeline xl:col-span-3 xl:row-start-2 xl:min-h-0 xl:border-x-0 xl:border-b-0"
		>
			<div className="flex min-w-0 items-center justify-between gap-3 border-b border-workbench-border px-3">
				<div className="flex min-w-0 items-center gap-2">
					<Scissors
						aria-hidden="true"
						className="size-4 shrink-0 text-workbench-selected"
					/>
					<div className="min-w-0">
						<h2 className="truncate text-sm font-semibold">
							Selection timeline
						</h2>
						<p className="truncate text-[11px] text-muted-foreground">
							{selectionSource}
						</p>
					</div>
				</div>
				<div className="flex min-w-0 items-center gap-2">
					<Badge className="rounded border-workbench-border bg-workbench-hover font-mono text-[10px] text-muted-foreground">
						{formatMediaTime(selection.startUs)}
					</Badge>
					<Badge className="rounded border-workbench-border bg-workbench-hover font-mono text-[10px] text-muted-foreground">
						{formatMediaTime(selection.endUs)}
					</Badge>
				</div>
			</div>
			<div className="grid min-h-0 grid-rows-[minmax(0,1fr)_1.5rem] gap-2 px-3 py-2">
				<div className="relative min-h-0 overflow-hidden rounded border border-workbench-border bg-workbench-lane-alt">
					<div className="absolute inset-0 opacity-80">
						{timelineBars.map((bar, index) => (
							<div
								className="absolute bottom-0 w-[0.45%] rounded-t bg-workbench-waveform/55"
								key={bar.id}
								style={{
									height: `${bar.height}%`,
									left: `${index * (100 / timelineBars.length)}%`,
								}}
							/>
						))}
					</div>
					<div className="absolute inset-x-0 top-1/2 h-px bg-workbench-border" />
					<div
						className="absolute inset-y-2 rounded-sm border border-workbench-selected bg-workbench-selected/25 shadow-[var(--shadow-workbench-selection-start)]"
						style={{
							left: `${startPercent}%`,
							width: `${selectionWidthPercent}%`,
						}}
					/>
					<div
						className="absolute inset-y-0 w-px bg-workbench-playhead"
						style={{ left: `${playheadPercent}%` }}
					>
						<div className="-left-1 absolute top-0 size-2 rotate-45 bg-workbench-playhead" />
					</div>
				</div>
				<div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 font-mono text-[10px] text-muted-foreground">
					<span>{formatMediaTime(0)}</span>
					<span className="truncate text-center">
						{formatMediaTime(Math.round(telemetry.currentTime * 1_000_000))}
					</span>
					<span>{formatMediaTime(durationUs)}</span>
				</div>
			</div>
		</section>
	);
}

function VidstackStateBridge({
	onChaptersChange,
	onQualitiesChange,
	onTelemetryChange,
}: {
	onChaptersChange: (chapters: ChapterSnapshot[]) => void;
	onQualitiesChange: (qualities: QualitySnapshot[]) => void;
	onTelemetryChange: (
		updater: (current: PlayerTelemetry) => PlayerTelemetry,
	) => void;
}) {
	const store = useMediaStore();
	const chapterOptions = useChapterOptions();
	const qualityOptions = useVideoQualityOptions({
		auto: "Auto",
		sort: "descending",
	});
	const previousChapterSignatureRef = useRef("");
	const previousQualitySignatureRef = useRef("");

	useEffect(() => {
		onTelemetryChange((current) => ({
			...current,
			currentTime: store.currentTime,
			duration: store.duration,
			paused: store.paused,
			source: describeSource(store.source),
			viewType: store.viewType,
		}));
	}, [
		onTelemetryChange,
		store.currentTime,
		store.duration,
		store.paused,
		store.source,
		store.viewType,
	]);

	useEffect(() => {
		const nextChapters = buildChapterSnapshots(chapterOptions, store.duration);
		const nextSignature = nextChapters
			.map(
				(chapter) =>
					`${chapter.value}:${chapter.startUs}:${chapter.endUs}:${chapter.selected}`,
			)
			.join("|");
		if (previousChapterSignatureRef.current === nextSignature) {
			return;
		}
		previousChapterSignatureRef.current = nextSignature;
		onChaptersChange(nextChapters);
	}, [chapterOptions, onChaptersChange, store.duration]);

	useEffect(() => {
		const nextQualities = qualityOptions.map((option) => ({
			autoSelected: option.autoSelected,
			bitrateText: option.bitrateText,
			height: option.quality?.height ?? null,
			label: option.label,
			selected: option.selected,
			value: option.value,
			width: option.quality?.width ?? null,
		}));
		const nextSignature = nextQualities
			.map(
				(quality) =>
					`${quality.value}:${quality.width}:${quality.height}:${quality.selected}:${quality.autoSelected}`,
			)
			.join("|");
		if (previousQualitySignatureRef.current === nextSignature) {
			return;
		}
		previousQualitySignatureRef.current = nextSignature;
		onQualitiesChange(nextQualities);
	}, [onQualitiesChange, qualityOptions]);

	return null;
}

function PrototypeChaptersMenu({
	onChapterSelected,
}: {
	onChapterSelected: (chapter: ChapterSnapshot) => void;
}) {
	const { showMenuDelay } = useDefaultLayoutContext();
	const chapterOptions = useChapterOptions();
	const store = useMediaStore();
	const chapters = useMemo(
		() => buildChapterSnapshots(chapterOptions, store.duration),
		[chapterOptions, store.duration],
	);

	if (chapters.length === 0) {
		return null;
	}

	return (
		<Menu.Root className="vds-chapters-menu vds-menu" showDelay={showMenuDelay}>
			<DefaultTooltip content="Chapters" placement="top">
				<Menu.Button
					aria-label="Chapters"
					className="vds-menu-button vds-button"
				>
					<defaultLayoutIcons.Menu.Chapters className="vds-icon" />
				</Menu.Button>
			</DefaultTooltip>
			<Menu.Items
				className="vds-chapters-menu-items vds-menu-items"
				placement="top end"
			>
				<Menu.RadioGroup
					className="vds-chapters-radio-group vds-radio-group"
					data-thumbnails=""
					value={chapterOptions.selectedValue}
				>
					{chapters.map((chapter, index) => {
						const option = chapterOptions[index];
						return (
							<Menu.Radio
								className="vds-chapter-radio vds-radio"
								key={chapter.value}
								onSelect={(event) => {
									onChapterSelected(chapter);
									option?.select(event);
								}}
								ref={option?.setProgressVar}
								value={chapter.value}
							>
								<Thumbnail.Root
									className="vds-thumbnail"
									src={sampleMedia.thumbnails}
									time={chapter.startUs / 1_000_000}
								>
									<Thumbnail.Img />
								</Thumbnail.Root>
								<div className="vds-chapter-radio-content">
									<span className="vds-chapter-radio-label">
										{chapter.label}
									</span>
									<span className="vds-chapter-radio-start-time">
										{chapter.startTimeText}
									</span>
									<span className="vds-chapter-radio-duration">
										{chapter.durationText}
									</span>
								</div>
							</Menu.Radio>
						);
					})}
				</Menu.RadioGroup>
			</Menu.Items>
		</Menu.Root>
	);
}

function SampleTextTracks() {
	return (
		<>
			<Track
				default
				kind="subtitles"
				label="English"
				lang="en-US"
				src={sampleMedia.subtitlesEnglish}
			/>
			<Track
				kind="subtitles"
				label="Spanish"
				lang="es-ES"
				src={sampleMedia.subtitlesSpanish}
			/>
			<Track
				default
				kind="chapters"
				label="Chapters"
				lang="en-US"
				src={sampleMedia.chapters}
			/>
		</>
	);
}

function PanelHeader({
	icon,
	kicker,
	title,
}: {
	icon: ReactNode;
	kicker: string;
	title: string;
}) {
	return (
		<div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-workbench-border px-3">
			<div className="flex size-7 shrink-0 items-center justify-center rounded border border-workbench-border bg-workbench-viewer text-workbench-progress">
				{icon}
			</div>
			<div className="min-w-0">
				<h2 className="truncate text-sm font-semibold">{title}</h2>
				<p className="truncate text-[10px] uppercase tracking-normal text-muted-foreground">
					{kicker}
				</p>
			</div>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
			<span className="truncate text-muted-foreground">{label}</span>
			<span className="truncate text-right font-mono text-[11px] text-foreground">
				{value}
			</span>
		</div>
	);
}

function resolvePlayerSource(
	sourceKind: PrototypeSourceKind,
	localSource: LocalSource | null,
): PlayerSrc {
	if (sourceKind === "sample-hls") {
		return {
			src: sampleMedia.hls,
			type: "application/x-mpegurl",
		};
	}
	if (sourceKind === "local-file" && localSource) {
		return {
			src: localSource.url,
			type: localSource.type,
		};
	}
	return {
		src: sampleMedia.mp4,
		type: "video/mp4",
	};
}

function normalizeLocalMediaType(file: File): LocalMediaMimeType {
	const type = file.type.toLowerCase();
	if (isLocalMediaMimeType(type)) {
		return type;
	}
	const extension = file.name.toLowerCase().split("..").pop();
	if (extension === "m3u8") {
		return "application/x-mpegurl";
	}
	if (extension === "mpd") {
		return "application/dash+xml";
	}
	if (extension === "webm") {
		return type.startsWith("audio/") ? "audio/webm" : "video/webm";
	}
	if (extension === "ogg" || extension === "oga") {
		return type.startsWith("audio/") ? "audio/ogg" : "video/ogg";
	}
	if (extension === "mp3") {
		return "audio/mp3";
	}
	if (extension === "flac") {
		return "audio/flac";
	}
	if (type.startsWith("audio/")) {
		return "audio/object";
	}
	return "video/object";
}

function isLocalMediaMimeType(type: string): type is LocalMediaMimeType {
	return localMediaMimeTypes.has(type as LocalMediaMimeType);
}

const localMediaMimeTypes = new Set<LocalMediaMimeType>([
	"application/dash+xml",
	"application/mpegurl",
	"application/vnd.apple.mpegurl",
	"application/x-mpegurl",
	"audio/flac",
	"audio/mpeg",
	"audio/mp3",
	"audio/object",
	"audio/ogg",
	"audio/webm",
	"audio/x-mpegurl",
	"video/mp4",
	"video/object",
	"video/ogg",
	"video/webm",
	"video/x-mpegurl",
]);

const timelineBars = [
	34, 49, 26, 58, 71, 42, 64, 33, 54, 77, 48, 29, 66, 82, 38, 57, 73, 45, 62,
	31, 52, 79, 69, 36, 44, 61, 86, 55, 28, 47, 76, 64, 41, 59, 72, 35, 51, 83,
	67, 39, 56, 74, 43, 63, 30, 53, 81, 46, 60, 70, 37, 50, 78, 65, 32, 58, 84,
	49, 27, 62, 75, 40, 55, 68,
].map((height, index) => ({
	height,
	id: `timeline-bar-${index}`,
}));

function buildChapterSnapshots(
	options: ChapterOption[],
	durationSeconds: number,
): ChapterSnapshot[] {
	return options
		.filter((option) => Number.isFinite(option.cue.startTime))
		.map((option, index, filteredOptions) => {
			const startSeconds = option.cue.startTime;
			const nextStartSeconds = filteredOptions[index + 1]?.cue.startTime;
			const endSeconds =
				Number.isFinite(nextStartSeconds) && nextStartSeconds > startSeconds
					? nextStartSeconds
					: Number.isFinite(durationSeconds) && durationSeconds > startSeconds
						? durationSeconds
						: Number.isFinite(option.cue.endTime) &&
								option.cue.endTime > startSeconds
							? option.cue.endTime
							: startSeconds;
			const startUs = Math.round(startSeconds * 1_000_000);
			const endUs = Math.round(endSeconds * 1_000_000);

			return {
				durationText: formatDurationLabel(endUs - startUs),
				endUs,
				label: option.label,
				selected: option.selected,
				startTimeText: option.startTimeText,
				startUs,
				value: option.value,
			};
		});
}

function formatDurationLabel(durationUs: MediaTimeUs): string {
	const totalSeconds = Math.max(0, Math.round(durationUs / 1_000_000));
	if (totalSeconds < 60) {
		return `${totalSeconds} sec`;
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (seconds === 0) {
		return `${minutes} min`;
	}
	return `${minutes} min ${seconds} sec`;
}

function describeSource(source: unknown): string {
	if (typeof source === "string") {
		return source;
	}
	if (source && typeof source === "object" && "src" in source) {
		const src = (source as { src?: unknown }).src;
		return typeof src === "string" ? src : "object source";
	}
	return "none";
}

function formatSeconds(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return "00:00:00.000";
	}
	return formatMediaTime(Math.round(seconds * 1_000_000));
}

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.min(100, Math.max(0, value));
}
