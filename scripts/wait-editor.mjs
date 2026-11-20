import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Infrastructure polling only: no check is retried. This runner contains the
// whole workspace store, so it can seed caches after BOTH lanes pass.
const endpoint = `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/jobs?per_page=100`;
const deadline = Date.now() + 120_000;
while (true) {
	const response = await fetch(endpoint, {
		headers: {
			Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
			Accept: "application/vnd.github+json",
		},
	});
	if (!response.ok)
		throw new Error(`Cannot verify peer job: HTTP ${response.status}`);
	const { jobs } = await response.json();
	const editor = jobs.find((job) => job.name === "Editor verification");
	if (editor?.status === "completed") {
		if (
			editor.conclusion !== "success" ||
			editor.head_sha !== process.env.GITHUB_SHA
		)
			throw new Error(
				`Editor verification did not pass for this revision: ${editor.conclusion}`,
			);
		await writeFile(
			resolve(process.argv[2], "peer-verification.json"),
			JSON.stringify(
				{
					id: editor.id,
					conclusion: editor.conclusion,
					revision: editor.head_sha,
					runId: process.env.GITHUB_RUN_ID,
				},
				null,
				2,
			),
		);
		await appendFile(process.env.GITHUB_OUTPUT, "verified=true\n");
		console.log(`Both verification lanes passed for ${editor.head_sha}`);
		break;
	}
	if (Date.now() >= deadline)
		throw new Error(
			"Editor verification has not completed; refusing caches and release assets",
		);
	await delay(1000);
}
