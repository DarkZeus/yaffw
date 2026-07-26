/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { EditorNextRoute } from "../entry/EditorNextRoute";

describe("EditorNextRoute product interface", () => {
	it("does not expose test construction options to product callers", () => {
		const renderProductRoute = () => <EditorNextRoute />;

		const renderRouteWithConstructionOption = () => (
			// @ts-expect-error The product route detects runtime support internally.
			<EditorNextRoute initialRuntime={undefined} />
		);

		expect(renderProductRoute).toBeTypeOf("function");
		expect(renderRouteWithConstructionOption).toBeTypeOf("function");
	});
});
