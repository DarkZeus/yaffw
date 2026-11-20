import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runCommand, runLanes } from "./verify-runner.mjs";

it("retains every failure and finishes independent commands before reporting", async () => {
	const directory = await mkdtemp(join(tmpdir(), "yaffw-verification-"));
	try {
		const results = [];
		await runLanes(
			[1, 0, 2].map((code) => async () => {
				results.push(
					await runCommand(
						`probe-${code}`,
						[
							"exec",
							"node",
							"-e",
							`console.log('completed ${code}');process.exit(${code})`,
						],
						directory,
						30,
					),
				);
			}),
			2,
		);
		expect(results).toHaveLength(3);
		expect(
			results
				.filter((result) => !result.passed)
				.map((result) => result.code)
				.sort((a, b) => a - b),
		).toEqual([1, 2]);
		expect(results.find((result) => result.code === 0)?.passed).toBe(true);
		for (const code of [0, 1, 2])
			expect(
				await readFile(join(directory, `probe-${code}.log`), "utf8"),
			).toContain(`completed ${code}`);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

it("finishes the evidence before flagging a performance budget failure", async () => {
	const directory = await mkdtemp(join(tmpdir(), "yaffw-budget-"));
	try {
		const result = await runCommand(
			"budget",
			["exec", "node", "-e", "console.log('all evidence')"],
			directory,
			0,
		);
		expect(result.passed).toBe(true);
		expect(result.withinBudget).toBe(false);
		expect(await readFile(join(directory, "budget.log"), "utf8")).toContain(
			"all evidence",
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
