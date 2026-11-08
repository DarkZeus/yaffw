import {
	BufferingIndicator,
	CaptionsButton,
	Container,
	Controls,
	FullscreenButton,
	Gesture,
	Menu,
	PiPButton,
	Slider,
	useTapGesture,
} from "@videojs/react";
import { usePlayer } from "@videojs/react/video";
import {
	Captions,
	ListVideo,
	LoaderCircle,
	Maximize,
	Minimize,
	Pause,
	PictureInPicture2,
	Play,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type { MediaTimeUs, Selection } from "@/editor-core/model";
import { formatMediaTime } from "../../media-time/format/media-time-presentation";
import "./preview-video-skin.css";

/** Video.js owns viewer presentation and fullscreen. All play/seek requests go
 * through YAFFW's transport, including in audio-master mode and while scrubbing.
 */
export function PreviewVideoSkin({
	children,
	durationUs,
	fullscreenRef,
	playbackRequested,
	onChapterSelected,
	onSeek,
	onTogglePlayback,
	playheadUs,
}: {
	children: ReactNode;
	durationUs: MediaTimeUs;
	fullscreenRef: RefObject<HTMLDivElement | null>;
	playbackRequested: boolean;
	onChapterSelected?: (selection: Selection) => void;
	onSeek: (timeUs: MediaTimeUs) => void;
	onTogglePlayback: () => void;
	playheadUs: MediaTimeUs;
}) {
	return (
		<Container className="preview-video-skin" ref={fullscreenRef}>
			{children}
			<BufferingIndicator className="preview-video-buffering">
				<LoaderCircle aria-hidden="true" />
			</BufferingIndicator>
			<PreviewVideoError />
			<PreviewVideoGestures onTogglePlayback={onTogglePlayback} />
			<Gesture type="doubletap" pointer="mouse" action="toggleFullscreen" />
			<Controls.Root>
				<Controls.Backdrop className="preview-video-backdrop" />
				<Controls.Content className="preview-video-controls">
					<Controls.Group
						aria-label="Viewer playback controls"
						className="preview-video-bar"
					>
						<button
							aria-label={playbackRequested ? "Pause preview" : "Play preview"}
							className="preview-video-button"
							onClick={onTogglePlayback}
							type="button"
						>
							{playbackRequested ? (
								<Pause aria-hidden="true" />
							) : (
								<Play aria-hidden="true" />
							)}
						</button>
						<span className="preview-video-time">
							{formatMediaTime(playheadUs)}
						</span>
						<Slider.Root
							className="preview-video-slider"
							label="Seek preview"
							max={durationUs}
							min={0}
							onValueChange={onSeek}
							step={1_000_000}
							value={playheadUs}
						>
							<Slider.Track className="preview-video-track">
								<Slider.Fill className="preview-video-fill" />
							</Slider.Track>
							<Slider.Thumb
								aria-valuetext={formatMediaTime(playheadUs)}
								className="preview-video-thumb"
							/>
						</Slider.Root>
						<span className="preview-video-time preview-video-duration">
							{formatMediaTime(durationUs)}
						</span>
						<PreviewChaptersMenu
							durationUs={durationUs}
							onChapterSelected={onChapterSelected}
						/>
						<CaptionsButton className="preview-video-button">
							<Captions aria-hidden="true" />
						</CaptionsButton>
						<PiPButton className="preview-video-button">
							<PictureInPicture2 aria-hidden="true" />
						</PiPButton>
						<FullscreenButton
							className="preview-video-button"
							render={(props, state) => (
								<button {...props}>
									{state.fullscreen ? (
										<Minimize aria-hidden="true" />
									) : (
										<Maximize aria-hidden="true" />
									)}
								</button>
							)}
						/>
					</Controls.Group>
				</Controls.Content>
			</Controls.Root>
		</Container>
	);
}

function PreviewVideoGestures({
	onTogglePlayback,
}: {
	onTogglePlayback: () => void;
}) {
	useTapGesture(
		(event) => {
			if (!event.altKey) onTogglePlayback();
		},
		{ pointer: "mouse" },
	);
	return null;
}

function PreviewVideoError() {
	const error = usePlayer((state) => state.error);
	return error ? (
		<p className="preview-video-error" role="alert">
			Preview unavailable: {error.message}
		</p>
	) : null;
}

function PreviewChaptersMenu({
	durationUs,
	onChapterSelected,
}: {
	durationUs: MediaTimeUs;
	onChapterSelected?: (selection: Selection) => void;
}) {
	const cues = usePlayer((state) => state.chaptersCues);
	const chapters = cues.flatMap((cue, index) => {
		const startUs = Math.round(cue.startTime * 1_000_000);
		const endUs = Math.min(
			durationUs,
			Math.round(
				(cues[index + 1]?.startTime ?? durationUs / 1_000_000) * 1_000_000,
			),
		);
		return Number.isFinite(startUs) && startUs >= 0 && endUs > startUs
			? [{ startUs, endUs, label: cue.text }]
			: [];
	});
	if (chapters.length === 0) return null;
	return (
		<Menu.Root side="top" align="end">
			<Menu.Trigger aria-label="Chapters" className="preview-video-button">
				<ListVideo aria-hidden="true" />
			</Menu.Trigger>
			<Menu.Popup className="preview-video-chapters">
				<Menu.Content>
					<Menu.Group>
						{chapters.map((chapter) => (
							<Menu.Item
								key={chapter.startUs}
								disabled={!onChapterSelected}
								onSelect={() => {
									onChapterSelected?.({
										startUs: chapter.startUs,
										endUs: chapter.endUs,
									});
								}}
							>
								<span>{chapter.label}</span>
								<span>{formatMediaTime(chapter.startUs)}</span>
							</Menu.Item>
						))}
					</Menu.Group>
				</Menu.Content>
			</Menu.Popup>
		</Menu.Root>
	);
}
