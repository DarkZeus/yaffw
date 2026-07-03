import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const editorNextDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(editorNextDir, "..", "..");

describe("Preview audio engine dependency contract", () => {
	it("does not publish the retired wavesurfer-multitrack preview transport", () => {
		const packageJson = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const lockfile = readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8");

		expect(packageJson.dependencies ?? {}).not.toHaveProperty(
			"wavesurfer-multitrack",
		);
		expect(packageJson.devDependencies ?? {}).not.toHaveProperty(
			"wavesurfer-multitrack",
		);
		expect(lockfile).not.toContain("wavesurfer-multitrack");
	});

	it("keeps Preview audio resource code out of retired browser-source naming", () => {
		const offenders = listEditorNextSourceFiles(editorNextDir)
			.filter((filePath) => filePath !== fileURLToPath(import.meta.url))
			.map((filePath) => ({
				contents: readFileSync(filePath, "utf8"),
				filePath,
			}))
			.filter(({ contents, filePath }) => {
				const path = relative(editorNextDir, filePath);

				return (
					path.includes("browser-audio-preview-source") ||
					contents.includes("BrowserAudioPreview")
				);
			})
			.map(({ filePath }) => relative(repoRoot, filePath));

		expect(offenders).toEqual([]);
	});
});

function listEditorNextSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = join(directory, entry.name);

		if (entry.isDirectory()) {
			return listEditorNextSourceFiles(entryPath);
		}

		if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
			return [];
		}

		return [entryPath];
	});
}
