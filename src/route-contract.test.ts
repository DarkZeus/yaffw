import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const prototypeRoutePath = "/editor-next-workbench-prototype";
const prototypeRouteFile = new URL(
	"./routes/editor-next-workbench-prototype.tsx",
	import.meta.url,
);
const prototypeComponentFile = new URL(
	"./editor-next/editor-workbench-prototype.tsx",
	import.meta.url,
);
const routeTreeFile = new URL("./routeTree.gen.ts", import.meta.url);
const appSidebarFile = new URL("./components/app-sidebar.tsx", import.meta.url);

describe("app route contract", () => {
	it("does not publish the workbench prototype as a route while preserving its reference component", () => {
		const routeTreeSource = readFileSync(routeTreeFile, "utf8");
		const appSidebarSource = readFileSync(appSidebarFile, "utf8");
		const prototypeComponentSource = readFileSync(prototypeComponentFile, "utf8");

		expect(routeTreeSource).not.toContain(prototypeRoutePath);
		expect(existsSync(prototypeRouteFile)).toBe(false);
		expect(appSidebarSource).not.toContain(prototypeRoutePath);
		expect(prototypeComponentSource).toContain(
			"export function EditorWorkbenchPrototype",
		);
	});
});
