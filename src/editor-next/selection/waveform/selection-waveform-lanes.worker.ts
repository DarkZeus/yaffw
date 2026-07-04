import { loadWaveformLaneOnCurrentThread } from "./selection-waveform-lanes-loader";

import type {
	WaveformLaneRequest,
	WaveformLaneResult,
} from "../types/selection-waveform-lanes.types";

type WorkerWaveformLaneRequest = Omit<WaveformLaneRequest, "signal" | "track">;

type WorkerRequestMessage = {
	request: WorkerWaveformLaneRequest;
	requestId: number;
	type: "generate";
};

type WorkerResponseMessage = {
	requestId: number;
	result: WaveformLaneResult;
	type: "done";
};

type WaveformWorkerScope = {
	addEventListener: (
		type: "message",
		listener: (event: MessageEvent<WorkerRequestMessage>) => void,
	) => void;
	postMessage: (
		message: WorkerResponseMessage,
		transfer?: Transferable[],
	) => void;
};

const workerScope = self as unknown as WaveformWorkerScope;

workerScope.addEventListener("message", (event) => {
	if (event.data.type !== "generate") {
		return;
	}

	void generateWaveform(event.data);
});

async function generateWaveform({ request, requestId }: WorkerRequestMessage) {
	const result = await loadWaveformLaneOnCurrentThread(request);
	const message = {
		requestId,
		result,
		type: "done",
	} satisfies WorkerResponseMessage;

	if (result.status === "ready" && result.samples instanceof Float32Array) {
		workerScope.postMessage(message, [result.samples.buffer as ArrayBuffer]);
		return;
	}

	workerScope.postMessage(message);
}
