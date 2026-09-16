import { loadVideoStripThumbnailsOnCurrentThread } from "./selection-video-strip-loader";

import type {
	VideoStripThumbnailProgress,
	VideoStripThumbnailRequest,
	VideoStripThumbnailResult,
} from "../types/selection-video-strip.types";

type WorkerThumbnailRequest = Omit<
	VideoStripThumbnailRequest,
	"onFrame" | "signal"
>;

type WorkerRequestMessage = {
	request: WorkerThumbnailRequest;
	requestId: number;
	type: "generate";
};

type WorkerResponseMessage =
	| {
			progress: VideoStripThumbnailProgress;
			requestId: number;
			type: "frame";
	  }
	| {
			requestId: number;
			result: VideoStripThumbnailResult;
			type: "done";
	  };

type ThumbnailWorkerScope = {
	addEventListener: (
		type: "message",
		listener: (event: MessageEvent<WorkerRequestMessage>) => void,
	) => void;
	postMessage: (message: WorkerResponseMessage) => void;
};

const workerScope = self as unknown as ThumbnailWorkerScope;

workerScope.addEventListener("message", (event) => {
	if (event.data.type !== "generate") {
		return;
	}

	void generateThumbnails(event.data);
});

async function generateThumbnails({
	request,
	requestId,
}: WorkerRequestMessage) {
	const result = await loadVideoStripThumbnailsOnCurrentThread({
		...request,
		onFrame: (progress) => {
			workerScope.postMessage({
				progress,
				requestId,
				type: "frame",
			});
		},
	});

	workerScope.postMessage({
		requestId,
		result,
		type: "done",
	});
}
