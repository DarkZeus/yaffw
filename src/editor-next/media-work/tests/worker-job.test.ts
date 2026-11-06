import { describe, expect, it, vi } from "vitest";
import { runWorkerJob } from "../workers/worker-job";

class JobWorker extends EventTarget {
	postMessage = vi.fn();
	terminate = vi.fn();

	reply(data: unknown) {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}
}

function startJob(
	worker: JobWorker,
	signal?: AbortSignal,
	onProgress?: (progress: number) => void,
) {
	return runWorkerJob<string, string, number>({
		createWorker: () => worker,
		request: "source",
		signal,
		onProgress,
		createAbortError: () => new DOMException("Cancelled", "AbortError"),
		failureMessage: "Worker failed",
	});
}

describe("one-shot worker ownership", () => {
	it("publishes progress until completion, then releases listeners and terminates once", async () => {
		const worker = new JobWorker();
		const controller = new AbortController();
		const progress = vi.fn();
		const result = startJob(worker, controller.signal, progress);
		worker.reply({ progress: 1, type: "progress" });
		worker.reply({ result: "ready", type: "done" });
		await expect(result).resolves.toBe("ready");
		worker.reply({ progress: 2, type: "progress" });
		controller.abort();
		expect(progress.mock.calls).toEqual([[1]]);
		expect(worker.terminate).toHaveBeenCalledTimes(1);
	});

	it("does not create a worker for already-cancelled work", async () => {
		const createWorker = vi.fn(() => new JobWorker());
		const controller = new AbortController();
		controller.abort();
		await expect(
			runWorkerJob({
				createWorker,
				request: "source",
				signal: controller.signal,
				createAbortError: () => new DOMException("Cancelled", "AbortError"),
				failureMessage: "Worker failed",
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(createWorker).not.toHaveBeenCalled();
	});

	it("catches cancellation during construction before posting work", async () => {
		const worker = new JobWorker();
		const controller = new AbortController();
		await expect(
			runWorkerJob({
				createWorker: () => {
					controller.abort();
					return worker;
				},
				request: "source",
				signal: controller.signal,
				createAbortError: () => new DOMException("Cancelled", "AbortError"),
				failureMessage: "Worker failed",
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(worker.postMessage).not.toHaveBeenCalled();
		expect(worker.terminate).toHaveBeenCalledOnce();
	});

	it("releases a running worker on cancellation and ignores its late result", async () => {
		const worker = new JobWorker();
		const controller = new AbortController();
		const result = startJob(worker, controller.signal);
		controller.abort();
		worker.reply({ result: "obsolete", type: "done" });
		await expect(result).rejects.toMatchObject({ name: "AbortError" });
		expect(worker.terminate).toHaveBeenCalledOnce();
	});

	it("releases a worker when posting throws instead of leaking it into fallback", async () => {
		const worker = new JobWorker();
		const failure = new DOMException("Uncloneable request", "DataCloneError");
		worker.postMessage.mockImplementation(() => {
			throw failure;
		});
		await expect(startJob(worker)).rejects.toBe(failure);
		expect(worker.terminate).toHaveBeenCalledOnce();
	});

	it("rejects unreadable responses and releases the worker", async () => {
		const worker = new JobWorker();
		const result = startJob(worker);
		worker.dispatchEvent(new MessageEvent("messageerror"));
		await expect(result).rejects.toThrow("Worker failed");
		expect(worker.terminate).toHaveBeenCalledOnce();
	});

	it("releases a worker when its progress consumer fails", async () => {
		const worker = new JobWorker();
		const failure = new Error("Cannot publish progress");
		const result = startJob(worker, undefined, () => {
			throw failure;
		});
		worker.reply({ progress: 1, type: "progress" });
		await expect(result).rejects.toBe(failure);
		expect(worker.terminate).toHaveBeenCalledOnce();
	});
});
