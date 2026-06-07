import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
	WaveformLaneIdentityInput,
	WaveformLaneIdentityViewModel,
	WaveformLaneProps,
} from "./selection-waveform-lane.types";
import type { WaveformLaneState } from "./selection-waveform-lanes.types";

export function WaveformLane({
	lane,
	onPointerDown,
	trackIndex,
}: WaveformLaneProps) {
	const identity = createWaveformLaneIdentityViewModel({
		status: lane.status,
		track: lane.track,
		trackIndex,
	});

	return (
		<div className="relative border-b border-workbench-border bg-workbench-lane">
			<div
				className="pointer-events-none relative z-30 flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b border-workbench-border bg-workbench-ruler/90 px-3 py-2 backdrop-blur"
				data-testid={`waveform-lane-header-${lane.track.id}`}
			>
				<span className="mr-1 truncate text-sm font-medium text-workbench-lane-foreground">
					{identity.title}
				</span>
				{identity.metadata.map((metadata) => (
					<Badge
						key={metadata}
						className="border-workbench-border-strong font-mono text-muted-foreground"
						variant="outline"
					>
						{metadata}
					</Badge>
				))}
				<LaneStatus lane={lane} status={identity.status} />
			</div>
			<button
				aria-label={`Seek ${identity.title} waveform lane`}
				className="relative block h-16 w-full cursor-crosshair overflow-hidden bg-workbench-lane-alt text-left"
				onMouseDown={(event) => {
					if (typeof window.PointerEvent === "undefined") {
						onPointerDown(event);
					}
				}}
				onPointerDown={onPointerDown}
				type="button"
			>
				<div className="absolute inset-x-0 top-1/2 h-px bg-workbench-border" />
				{lane.status === "ready" ? (
					<WaveformCanvas label={identity.title} samples={lane.samples} />
				) : null}
				{lane.status === "loading" ? (
					<div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
						Loading waveform
					</div>
				) : null}
				{lane.status === "unavailable" ? (
					<div className="absolute inset-0 grid place-items-center px-4 text-xs text-muted-foreground">
						Waveform generation failed
					</div>
				) : null}
			</button>
		</div>
	);
}

function LaneStatus({
	lane,
	status,
}: {
	lane: WaveformLaneState;
	status: WaveformLaneIdentityViewModel["status"];
}) {
	if (status.tone === "ready") {
		return null;
	}

	if (lane.status === "unavailable") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge
						className="pointer-events-auto border-destructive/45 bg-destructive/15 text-destructive"
						tabIndex={0}
						variant="outline"
					>
						{status.label}
					</Badge>
				</TooltipTrigger>
				<TooltipContent className="max-w-80">{lane.reason}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Badge
			className="border-workbench-border-strong text-muted-foreground"
			variant="outline"
		>
			{status.label}
		</Badge>
	);
}

export function createWaveformLaneIdentityViewModel({
	status,
	track,
	trackIndex,
}: WaveformLaneIdentityInput): WaveformLaneIdentityViewModel {
	const title = track.label?.trim() || `Unnamed audio lane ${trackIndex + 1}`;

	return {
		metadata: [
			formatTrackCodec(track.codec),
			formatTrackChannels(track.channels),
		],
		status: formatWaveformLaneStatus(status),
		title,
	};
}

function formatTrackCodec(codec: string | undefined) {
	const normalizedCodec = codec?.trim();

	if (!normalizedCodec) {
		return "Codec unknown";
	}

	return normalizedCodec.toUpperCase();
}

function formatTrackChannels(channels: number | undefined) {
	if (!channels || channels <= 0) {
		return "Channels unknown";
	}

	return channels === 1 ? "1 channel" : `${channels} channels`;
}

function formatWaveformLaneStatus(
	status: WaveformLaneState["status"],
): WaveformLaneIdentityViewModel["status"] {
	switch (status) {
		case "loading":
			return {
				label: "Loading waveform",
				tone: "pending",
			};
		case "ready":
			return {
				label: "Waveform ready",
				tone: "ready",
			};
		case "unavailable":
			return {
				label: "Waveform generation failed",
				tone: "unavailable",
			};
	}
}

function WaveformCanvas({
	label,
	samples,
}: {
	label: string;
	samples: number[];
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;

		if (!canvas) {
			return;
		}

		const currentCanvas = canvas;

		function drawWaveform() {
			const context = currentCanvas.getContext("2d");

			if (!context) {
				return;
			}

			const rect = currentCanvas.getBoundingClientRect();
			const pixelRatio = window.devicePixelRatio || 1;
			const width = Math.max(1, Math.round(rect.width * pixelRatio));
			const height = Math.max(1, Math.round(rect.height * pixelRatio));
			const centerY = height / 2;

			currentCanvas.width = width;
			currentCanvas.height = height;
			context.clearRect(0, 0, width, height);
			context.fillStyle = canvasTokenColor(
				currentCanvas,
				"--workbench-waveform-guide",
				"CanvasText",
			);
			context.fillRect(0, centerY - 1, width, 2);
			context.fillStyle = canvasTokenColor(
				currentCanvas,
				"--workbench-waveform",
				"CanvasText",
			);

			for (let x = 0; x < width; x += 1) {
				const sampleIndex = Math.min(
					samples.length - 1,
					Math.floor((x / width) * samples.length),
				);
				const nextSampleIndex = Math.min(
					samples.length - 1,
					Math.ceil(((x + 1) / width) * samples.length),
				);
				let peak = 0;

				for (let index = sampleIndex; index <= nextSampleIndex; index += 1) {
					peak = Math.max(peak, samples[index] ?? 0);
				}

				const barHeight = Math.max(1, peak * (height - 8));
				context.fillRect(x, centerY - barHeight / 2, 1, barHeight);
			}
		}

		drawWaveform();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", drawWaveform);
			return () => {
				window.removeEventListener("resize", drawWaveform);
			};
		}

		const observer = new ResizeObserver(drawWaveform);
		observer.observe(currentCanvas);

		return () => {
			observer.disconnect();
		};
	}, [samples]);

	return (
		<canvas
			aria-label={`${label} waveform detail`}
			className="absolute inset-x-0 top-3 bottom-3 h-[calc(100%-1.5rem)] w-full"
			data-sample-count={samples.length}
			ref={canvasRef}
		/>
	);
}

function canvasTokenColor(
	element: HTMLElement,
	tokenName: string,
	fallback: string,
) {
	return (
		getComputedStyle(element).getPropertyValue(tokenName).trim() || fallback
	);
}
