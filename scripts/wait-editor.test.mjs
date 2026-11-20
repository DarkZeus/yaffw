import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
it.each(["success", "failure", "cancelled", "skipped", "wrong-revision"])(
	"seeds caches only after the exact editor revision succeeds (%s)",
	async (conclusion) => {
		const directory = await mkdtemp(join(tmpdir(), "yaffw-peer-"));
		const expected = "a".repeat(40);
		let requests = 0;
		const server = createServer((_request, response) => {
			const pending = conclusion === "success" && requests++ === 0;
			response.setHeader("Content-Type", "application/json");
			response.end(
				JSON.stringify({
					jobs: [
						{
							id: 7,
							name: "Editor verification",
							status: pending ? "in_progress" : "completed",
							conclusion:
								conclusion === "wrong-revision" ? "success" : conclusion,
							head_sha:
								conclusion === "wrong-revision" ? "b".repeat(40) : expected,
						},
					],
				}),
			);
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("Missing fixture port");
			const run = execute(
				process.execPath,
				[
					fileURLToPath(new URL("./wait-editor.mjs", import.meta.url)),
					directory,
				],
				{
					env: {
						...process.env,
						GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
						GITHUB_REPOSITORY: "fixture/repository",
						GITHUB_RUN_ID: "123",
						GITHUB_SHA: expected,
						GITHUB_TOKEN: "fixture-token",
						GITHUB_OUTPUT: join(directory, "outputs"),
					},
				},
			);
			if (conclusion === "success") {
				await run;
				expect(await readFile(join(directory, "outputs"), "utf8")).toBe(
					"verified=true\n",
				);
				expect(requests).toBe(2);
			} else {
				await expect(run).rejects.toMatchObject({ code: 1 });
				await expect(
					readFile(join(directory, "outputs"), "utf8"),
				).rejects.toMatchObject({ code: "ENOENT" });
			}
		} finally {
			await new Promise((resolve) => server.close(resolve));
			await rm(directory, { recursive: true, force: true });
		}
	},
);
