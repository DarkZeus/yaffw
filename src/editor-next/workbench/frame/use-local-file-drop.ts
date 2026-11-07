import { useEffect, useEffectEvent, useState } from "react";

const videoExtensions = [
	".mp4",
	".avi",
	".mov",
	".mkv",
	".webm",
	".m4v",
	".3gp",
];
export const localVideoFileAccept = ["video/*", ...videoExtensions].join(",");

export type LocalFileDropFeedback =
	| "idle"
	| "accepted"
	| "rejected"
	| "unverified";

export function useLocalFileDrop(
	importEnabled: boolean,
	onFileDropped: (file: File) => void,
): LocalFileDropFeedback {
	const [feedback, setFeedback] = useState<LocalFileDropFeedback>("idle");
	const importFile = useEffectEvent(onFileDropped);

	useEffect(() => {
		function resetFeedback() {
			setFeedback("idle");
		}

		function updateFeedback(event: DragEvent) {
			const transfer = event.dataTransfer;
			if (!transfer?.types.includes("Files")) {
				resetFeedback();
				return;
			}

			event.preventDefault();
			const nextFeedback = importEnabled ? readDragFeedback(transfer) : "idle";
			transfer.dropEffect =
				nextFeedback === "accepted" || nextFeedback === "unverified"
					? "copy"
					: "none";
			setFeedback(nextFeedback);
		}

		function handleDragLeave(event: DragEvent) {
			const nextTarget = event.relatedTarget;
			if (nextTarget instanceof Node && document.contains(nextTarget)) return;
			resetFeedback();
		}

		function handleDrop(event: DragEvent) {
			resetFeedback();
			const transfer = event.dataTransfer;
			if (!transfer?.types.includes("Files")) return;

			event.preventDefault();
			const file = transfer.files[0];
			if (importEnabled && file && isSupportedVideoFile(file)) {
				importFile(file);
			}
		}

		resetFeedback();
		window.addEventListener("dragenter", updateFeedback, true);
		window.addEventListener("dragover", updateFeedback, true);
		window.addEventListener("dragleave", handleDragLeave, true);
		window.addEventListener("drop", handleDrop, true);
		window.addEventListener("dragend", resetFeedback, true);
		window.addEventListener("blur", resetFeedback);
		return () => {
			window.removeEventListener("dragenter", updateFeedback, true);
			window.removeEventListener("dragover", updateFeedback, true);
			window.removeEventListener("dragleave", handleDragLeave, true);
			window.removeEventListener("drop", handleDrop, true);
			window.removeEventListener("dragend", resetFeedback, true);
			window.removeEventListener("blur", resetFeedback);
		};
	}, [importEnabled]);

	return importEnabled ? feedback : "idle";
}

function readDragFeedback(
	transfer: DataTransfer,
): Exclude<LocalFileDropFeedback, "idle"> {
	// Before drop, browsers expose item types but keep filenames and contents private.
	const firstFile = Array.from(transfer.items).find(
		(item) => item.kind === "file",
	);
	const type = firstFile?.type;
	if (!type || type === "application/octet-stream") return "unverified";
	return isVideoMimeType(type) ? "accepted" : "rejected";
}

function isSupportedVideoFile(file: File): boolean {
	const name = file.name.toLowerCase();
	return (
		isVideoMimeType(file.type) ||
		videoExtensions.some((extension) => name.endsWith(extension))
	);
}

function isVideoMimeType(type: string): boolean {
	return type.startsWith("video/");
}
