import { describe, expect, it, vi } from "vitest";

import {
	createDisposableMediaWorkScope,
	withDisposableMediaWorkScope,
} from "../scopes/disposable-media-work-scope";

describe("disposable media work scope", () => {
	it("runs registered media cleanup exactly once", async () => {
		const calls: string[] = [];
		const dispose = vi.fn(() => {
			calls.push("dispose");
		});
		const close = vi.fn(() => {
			calls.push("close");
		});
		const cancel = vi.fn(() => {
			calls.push("cancel");
		});
		const cleanup = vi.fn(() => {
			calls.push("cleanup");
		});
		const scope = createDisposableMediaWorkScope();

		scope.registerDisposable({ dispose });
		scope.registerClosable({ close });
		scope.registerCancellable({ cancel });
		scope.registerCleanup(cleanup);

		await scope.dispose();
		await scope.dispose();

		expect(calls).toEqual(["cleanup", "cancel", "close", "dispose"]);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalledTimes(1);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it("cleans up after successful work and returns the work result", async () => {
		const dispose = vi.fn();

		await expect(
			withDisposableMediaWorkScope((scope) => {
				scope.registerDisposable({ dispose });

				return "ready";
			}),
		).resolves.toBe("ready");

		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it("cleans up after thrown work errors without replacing the work failure", async () => {
		const dispose = vi.fn();
		const failure = new Error("Decode failed");

		await expect(
			withDisposableMediaWorkScope((scope) => {
				scope.registerDisposable({ dispose });

				throw failure;
			}),
		).rejects.toBe(failure);

		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it("preserves the work failure when cleanup also fails", async () => {
		const failure = new Error("Encode failed");
		const cleanupFailure = new Error("Cleanup failed");

		await expect(
			withDisposableMediaWorkScope((scope) => {
				scope.registerCleanup(() => {
					throw cleanupFailure;
				});

				throw failure;
			}),
		).rejects.toBe(failure);
	});

	it("allows cancellation-style cleanup before work returns", async () => {
		const dispose = vi.fn();

		const result = await withDisposableMediaWorkScope(async (scope) => {
			scope.registerDisposable({ dispose });

			await scope.dispose();

			return {
				reason: "The media work was cancelled.",
				status: "unavailable",
			};
		});

		expect(result).toEqual({
			reason: "The media work was cancelled.",
			status: "unavailable",
		});
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});
