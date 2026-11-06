export type WorkerJobRequest<Request> = {
	request: Request;
	type: "generate";
};

export type WorkerJobResponse<Result, Progress = never> =
	| { result: Result; type: "done" }
	| { progress: Progress; type: "progress" };

export type WorkerJobScope<Request, Result, Progress = never> = {
	addEventListener: (
		type: "message",
		listener: (event: MessageEvent<WorkerJobRequest<Request>>) => void,
	) => void;
	postMessage: (
		message: WorkerJobResponse<Result, Progress>,
		transfer?: Transferable[],
	) => void;
};

type JobWorker = Pick<
	Worker,
	"addEventListener" | "removeEventListener" | "postMessage" | "terminate"
>;

export function runWorkerJob<Request, Result, Progress = never>({
	createWorker,
	request,
	signal,
	onProgress,
	createAbortError,
	failureMessage,
}: {
	createWorker: () => JobWorker;
	request: Request;
	signal?: AbortSignal;
	onProgress?: (progress: Progress) => void;
	createAbortError: () => Error;
	failureMessage: string;
}): Promise<Result> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(createAbortError());
			return;
		}

		const worker = createWorker();
		let settled = false;

		function cleanup() {
			signal?.removeEventListener("abort", handleAbort);
			worker.removeEventListener("error", handleError);
			worker.removeEventListener("messageerror", handleMessageError);
			worker.removeEventListener("message", handleMessage);
			worker.terminate();
		}

		function fail(error: unknown) {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error instanceof Error ? error : new Error(String(error)));
		}

		function handleAbort() {
			fail(createAbortError());
		}

		function handleError(event: ErrorEvent) {
			fail(new Error(event.message || failureMessage));
		}

		function handleMessageError() {
			fail(new Error(failureMessage));
		}

		function handleMessage(
			event: MessageEvent<WorkerJobResponse<Result, Progress>>,
		) {
			if (settled) return;
			try {
				if (event.data.type === "progress") {
					onProgress?.(event.data.progress);
				} else if (event.data.type === "done") {
					settled = true;
					cleanup();
					resolve(event.data.result);
				}
			} catch (error) {
				fail(error);
			}
		}

		try {
			signal?.addEventListener("abort", handleAbort, { once: true });
			worker.addEventListener("error", handleError);
			worker.addEventListener("messageerror", handleMessageError);
			worker.addEventListener("message", handleMessage);
			if (signal?.aborted) {
				handleAbort();
				return;
			}
			worker.postMessage({
				request,
				type: "generate",
			} satisfies WorkerJobRequest<Request>);
		} catch (error) {
			fail(error);
		}
	});
}
