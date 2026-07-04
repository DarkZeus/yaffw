import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("workbench design tokens", () => {
	it("exposes scoped shadcn and Tailwind tokens for editor-next workbench surfaces and states", () => {
		expect(styles).toContain(".workbench");

		for (const token of [
			"--workbench",
			"--workbench-foreground",
			"--workbench-rail",
			"--workbench-viewer",
			"--workbench-timeline",
			"--workbench-ruler",
			"--workbench-lane",
			"--workbench-inspector",
			"--workbench-transport",
			"--workbench-border",
			"--workbench-border-strong",
			"--workbench-focus",
			"--workbench-hover",
			"--workbench-selected",
			"--workbench-disabled",
			"--workbench-loading",
			"--workbench-progress",
			"--workbench-playhead",
			"--workbench-destructive",
			"--workbench-waveform",
		]) {
			expect(styles).toContain(`${token}:`);
		}

		for (const mapping of [
			"--color-workbench: var(--workbench)",
			"--color-workbench-rail: var(--workbench-rail)",
			"--color-workbench-viewer: var(--workbench-viewer)",
			"--color-workbench-timeline: var(--workbench-timeline)",
			"--color-workbench-lane: var(--workbench-lane)",
			"--color-workbench-inspector: var(--workbench-inspector)",
			"--color-workbench-transport: var(--workbench-transport)",
			"--color-workbench-selected: var(--workbench-selected)",
			"--color-workbench-progress: var(--workbench-progress)",
			"--color-workbench-playhead: var(--workbench-playhead)",
		]) {
			expect(styles).toContain(mapping);
		}
	});
});
