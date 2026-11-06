import type {
	WorkerJobRequest,
	WorkerJobResponse,
	WorkerJobScope,
} from "../../media-work/workers/worker-job";
import type {
	WaveformLaneResult,
	WaveformWorkerRequest,
} from "../types/selection-waveform-lanes.types";
import { loadDecodedWaveformLane } from "./selection-waveform-lanes-loader";

const workerScope = self as unknown as WorkerJobScope<
	WaveformWorkerRequest,
	WaveformLaneResult
>;

workerScope.addEventListener("message", (event) => {
	if (event.data.type === "generate") {
		void generateWaveform(event.data);
	}
});

async function generateWaveform({
	request,
}: WorkerJobRequest<WaveformWorkerRequest>) {
	const result = await loadDecodedWaveformLane(request);
	const message = {
		result,
		type: "done",
	} satisfies WorkerJobResponse<WaveformLaneResult>;

	if (result.status === "ready" && result.samples instanceof Float32Array) {
		workerScope.postMessage(message, [result.samples.buffer as ArrayBuffer]);
		return;
	}

	workerScope.postMessage(message);
}
