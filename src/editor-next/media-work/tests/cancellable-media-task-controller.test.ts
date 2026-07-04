import { describe, expect, it } from "vitest";

import { createCancellableMediaTaskController } from "../tasks/cancellable-media-task-controller";

describe("cancellable media task controller", () => {
	it("cancels previous media tasks when a newer task starts", () => {
		const controller = createCancellableMediaTaskController();
		const firstTask = controller.startTask();
		const secondTask = controller.startTask();

		expect(firstTask.signal.aborted).toBe(true);
		expect(firstTask.isCurrent()).toBe(false);
		expect(secondTask.signal.aborted).toBe(false);
		expect(secondTask.isCurrent()).toBe(true);

		firstTask.finish();

		expect(secondTask.isCurrent()).toBe(true);
	});

	it("makes task cancellation and finish idempotent", () => {
		const controller = createCancellableMediaTaskController();
		const task = controller.startTask();

		controller.cancelCurrentTask();
		controller.cancelCurrentTask();
		task.cancel();
		task.finish();

		expect(task.signal.aborted).toBe(true);
		expect(task.isCurrent()).toBe(false);
	});
});
