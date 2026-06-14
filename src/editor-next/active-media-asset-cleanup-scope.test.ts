import { describe, expect, it, vi } from "vitest";

import { createActiveMediaAssetCleanupScopeController } from "./active-media-asset-cleanup-scope";

describe("active Media asset cleanup scope", () => {
	it("disposes registered Preview resources exactly once", () => {
		const controller = createActiveMediaAssetCleanupScopeController();
		const scope = controller.replaceCurrentScope("asset-1");
		const cleanup = vi.fn();

		const registration = scope.registerCleanup(cleanup);

		registration.dispose();
		controller.disposeCurrentScope();
		registration.dispose();

		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(controller.currentScope()).toBeNull();
		expect(scope.isCurrent()).toBe(false);
	});

	it("replaces the active Media asset scope without disposing the current scope from stale handles", () => {
		const controller = createActiveMediaAssetCleanupScopeController();
		const firstCleanup = vi.fn();
		const secondCleanup = vi.fn();

		const firstScope = controller.replaceCurrentScope("asset-1");
		firstScope.registerCleanup(firstCleanup);

		const secondScope = controller.replaceCurrentScope("asset-2");
		secondScope.registerCleanup(secondCleanup);

		firstScope.dispose();

		expect(firstCleanup).toHaveBeenCalledTimes(1);
		expect(secondCleanup).not.toHaveBeenCalled();
		expect(controller.currentScope()).toBe(secondScope);
		expect(firstScope.isCurrent()).toBe(false);
		expect(secondScope.isCurrent()).toBe(true);

		controller.disposeCurrentScope();

		expect(secondCleanup).toHaveBeenCalledTimes(1);
		expect(controller.currentScope()).toBeNull();
	});

	it("immediately releases resources registered by stale async completion", () => {
		const controller = createActiveMediaAssetCleanupScopeController();
		const staleCleanup = vi.fn();
		const currentCleanup = vi.fn();

		const staleScope = controller.replaceCurrentScope("asset-1");
		controller.replaceCurrentScope("asset-2").registerCleanup(currentCleanup);

		staleScope.registerCleanup(staleCleanup);

		expect(staleCleanup).toHaveBeenCalledTimes(1);
		expect(currentCleanup).not.toHaveBeenCalled();

		controller.disposeCurrentScope();

		expect(currentCleanup).toHaveBeenCalledTimes(1);
	});
});
