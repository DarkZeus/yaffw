import { describe, expect, it } from "vitest";

import { createSynchronousMediaWorkScope } from "../scopes/synchronous-media-work-scope";

describe("synchronous media resource ownership", () => {
	it("releases resources in reverse order even when multiple cleanups fail", () => {
		const scope = createSynchronousMediaWorkScope();
		const released: string[] = [];
		const firstFailure = new Error("Input cleanup failed");
		const secondFailure = new Error("Decoder cleanup failed");
		scope.registerCleanup(() => {
			released.push("input");
			throw firstFailure;
		});
		scope.registerCleanup(() => {
			released.push("decoder");
			throw secondFailure;
		});
		scope.registerCleanup(() => released.push("sample"));

		let failure: unknown;
		try {
			scope.dispose();
		} catch (error) {
			failure = error;
		}
		expect(released).toEqual(["sample", "decoder", "input"]);
		expect(failure).toBeInstanceOf(AggregateError);
		expect((failure as AggregateError).errors).toEqual([
			secondFailure,
			firstFailure,
		]);
		scope.dispose();
		expect(released).toHaveLength(3);
	});

	it("immediately releases late async resources and does not release early resources twice", () => {
		const scope = createSynchronousMediaWorkScope();
		const released: string[] = [];
		const early = scope.registerCleanup(() => released.push("early"));
		early.dispose();
		scope.dispose();
		const late = scope.registerCleanup(() => released.push("late"));
		late.dispose();
		early.dispose();
		expect(released).toEqual(["early", "late"]);
	});
});
