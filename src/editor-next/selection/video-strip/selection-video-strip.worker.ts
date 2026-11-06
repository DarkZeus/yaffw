import type {
	WorkerJobRequest,
	WorkerJobScope,
} from "../../media-work/workers/worker-job";
import type {
	VideoStripThumbnailProgress,
	VideoStripThumbnailResult,
	VideoStripWorkerRequest,
} from "../types/selection-video-strip.types";
import { loadVideoStripThumbnailsOnCurrentThread } from "./selection-video-strip-loader";

const workerScope = self as unknown as WorkerJobScope<
	VideoStripWorkerRequest,
	VideoStripThumbnailResult,
	VideoStripThumbnailProgress
>;

workerScope.addEventListener("message", (event) => {
	if (event.data.type === "generate") {
		void generateThumbnails(event.data);
	}
});

async function generateThumbnails({
	request,
}: WorkerJobRequest<VideoStripWorkerRequest>) {
	const result = await loadVideoStripThumbnailsOnCurrentThread({
		...request,
		onFrame: (progress) => {
			workerScope.postMessage({ progress, type: "progress" });
		},
	});

	workerScope.postMessage({ result, type: "done" });
}
