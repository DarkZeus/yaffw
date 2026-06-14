/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import { createPreviewAdapterLifecycle } from "./preview-adapter-lifecycle";

describe("createPreviewAdapterLifecycle", () => {
	it("cleans up adapter resources once and clears registered containers", () => {
		const lifecycle = createPreviewAdapterLifecycle();
		const unsubscribe = vi.fn();
		const destroyable = {
			destroy: vi.fn(),
		};
		const cancelFrame = vi.fn();
		const cleanup = vi.fn();
		const container = document.createElement("div");
		container.append(document.createElement("wave"));

		lifecycle.registerContainerClear(container);
		lifecycle.registerUnsubscribe(unsubscribe);
		lifecycle.registerDestroyable(destroyable);
		lifecycle.registerAnimationFrame(7, cancelFrame);
		lifecycle.registerCleanup(cleanup);

		lifecycle.dispose();
		lifecycle.dispose();

		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(cancelFrame).toHaveBeenCalledTimes(1);
		expect(cancelFrame).toHaveBeenCalledWith(7);
		expect(destroyable.destroy).toHaveBeenCalledTimes(1);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(container.childElementCount).toBe(0);
	});

	it("immediately cleans up resources registered after async setup was disposed", () => {
		const lifecycle = createPreviewAdapterLifecycle();
		const destroyable = {
			destroy: vi.fn(),
		};
		const cancelFrame = vi.fn();
		const cleanup = vi.fn();

		lifecycle.dispose();

		lifecycle.registerCleanup(cleanup);
		lifecycle.registerDestroyable(destroyable);
		lifecycle.registerAnimationFrame(9, cancelFrame);

		expect(lifecycle.isDisposed()).toBe(true);
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(destroyable.destroy).toHaveBeenCalledTimes(1);
		expect(cancelFrame).toHaveBeenCalledTimes(1);
		expect(cancelFrame).toHaveBeenCalledWith(9);
	});
});
