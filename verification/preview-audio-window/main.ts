import {
	type PreviewAudioEvidenceConfig,
	type PreviewAudioEvidenceRecord,
	createBrowserPreviewAudioTrialExecutor,
	runBrowserPreviewAudioFunctionalScenarios,
	runPreviewAudioEvidence,
} from "../../src/editor-next/audio/prototype/playhead-window/preview-audio-evidence-harness";

const fixtureInput = requiredElement<HTMLInputElement>("fixture");
const playbackSecondsInput = requiredElement<HTMLInputElement>("playback-seconds");
const windowSecondsInput = requiredElement<HTMLInputElement>("window-seconds");
const lookaheadSecondsInput = requiredElement<HTMLInputElement>("lookahead-seconds");
const runButton = requiredElement<HTMLButtonElement>("run");
const functionalButton = requiredElement<HTMLButtonElement>("functional");
const downloadButton = requiredElement<HTMLButtonElement>("download");
const status = requiredElement<HTMLParagraphElement>("status");
const results = requiredElement<HTMLTableSectionElement>("results");
const json = requiredElement<HTMLPreElement>("json");
let latestRecord: PreviewAudioEvidenceRecord | null = null;
const CONTROLLED_FIXTURE = {
	durationSeconds: 120,
	sha256: "75d390a7cf42f52b6360c28d8408447075742720bc3f7b3e31d467eab613400a",
	sizeBytes: 3_998_229,
	trackCount: 2,
} as const;
const EVIDENCE_REVISION =
	"9036d2393dc2b9ec958b7502b75ca4034ee6de86+issue-108-working-tree";

runButton.addEventListener("click", async () => {
	const file = fixtureInput.files?.[0];
	if (!file) {
		showError("Select the controlled fixture first.");
		return;
	}

	runButton.disabled = true;
	downloadButton.disabled = true;
	results.replaceChildren();
	json.textContent = "Running…";
	status.classList.remove("error");

	try {
		const sha256 = await digestSha256(file);
		if (
			sha256 !== CONTROLLED_FIXTURE.sha256 ||
			file.size !== CONTROLLED_FIXTURE.sizeBytes
		) {
			throw new Error(
				"The controlled comparison requires the recorded 120-second two-track fixture.",
			);
		}
		const config = readConfig();
		status.textContent = `Fixture ${sha256.slice(0, 12)}… — starting 15 trials.`;
		latestRecord = await runPreviewAudioEvidence({
			config,
			executeTrial: createBrowserPreviewAudioTrialExecutor(),
			fixture: {
				durationSeconds: CONTROLLED_FIXTURE.durationSeconds,
				fileName: file.name,
				mimeType: file.type || "video/mp4",
				sha256,
				sizeBytes: file.size,
				trackCount: CONTROLLED_FIXTURE.trackCount,
			},
			gitSha: EVIDENCE_REVISION,
			onTrial(trial, completed, total) {
				status.textContent = `Completed ${completed} / ${total}: ${trial.strategy}`;
				appendTrial(trial);
			},
			source: file,
		});

		json.textContent = JSON.stringify(latestRecord, null, 2);
		status.textContent = "All controlled trials completed and passed the evidence-record gate.";
		downloadButton.disabled = false;
	} catch (error) {
		latestRecord = null;
		showError(error instanceof Error ? error.message : String(error));
		json.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
	} finally {
		runButton.disabled = false;
	}
});

functionalButton.addEventListener("click", async () => {
	const file = fixtureInput.files?.[0];
	if (!file) {
		showError("Select the controlled fixture first.");
		return;
	}
	functionalButton.disabled = true;
	status.classList.remove("error");
	status.textContent = "Running pause/seek/rate/loop/retry/stall/replacement/cleanup scenarios…";
	try {
		const result = await runBrowserPreviewAudioFunctionalScenarios({
			config: readConfig(),
			source: file,
		});
		json.textContent = JSON.stringify(result, null, 2);
		const failures = result.operations.filter(
			(operation) => operation.status === "failed",
		);
		status.textContent = failures.length
			? `${failures.length} lifecycle operation(s) failed.`
			: `All ${result.operations.length} lifecycle operations passed.`;
		if (failures.length) status.classList.add("error");
	} catch (error) {
		showError(error instanceof Error ? error.message : String(error));
	} finally {
		functionalButton.disabled = false;
	}
});

downloadButton.addEventListener("click", () => {
	if (!latestRecord) return;
	const blob = new Blob([JSON.stringify(latestRecord, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.download = `preview-audio-window-evidence-${latestRecord.recordedAt.slice(0, 10)}.json`;
	anchor.href = url;
	anchor.click();
	URL.revokeObjectURL(url);
});

function readConfig(): PreviewAudioEvidenceConfig {
	return {
		chunkTargetSeconds: 0.2,
		initialPlayheadSeconds: 0,
		lookaheadSeconds: numberValue(lookaheadSecondsInput),
		playbackRate: 1,
		playbackSeconds: numberValue(playbackSecondsInput),
		pumpIntervalMs: 50,
		stallSchedule: [
			{ atPlaybackSeconds: 4, durationMs: 250 },
			{ atPlaybackSeconds: 10, durationMs: 500 },
			{ atPlaybackSeconds: 18, durationMs: 1_000 },
		],
		windowSeconds: numberValue(windowSecondsInput),
	};
}

function appendTrial(trial: PreviewAudioEvidenceRecord["trials"][number]) {
	const row = results.insertRow();
	const cleanupPassed =
		trial.cleanup.residualNodes === 0 &&
		trial.cleanup.residualPcmBytes === 0 &&
		trial.cleanup.residualTimers === 0;
	for (const value of [
		trial.id,
		trial.strategy,
		trial.readiness.prepareToReadyMs.toFixed(1),
		formatBytes(trial.pcm.peakBytes),
		trial.responsiveness.timerIntervals.p95Ms.toFixed(1),
		String(trial.continuity.underrunCount),
		String(trial.sourceChurn.nodesCreated),
		cleanupPassed ? "pass" : "FAIL",
	]) {
		row.insertCell().textContent = value;
	}
}

async function digestSha256(file: File) {
	const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function numberValue(input: HTMLInputElement) {
	const value = input.valueAsNumber;
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${input.id} must be a positive number.`);
	}
	return value;
}

function formatBytes(bytes: number) {
	return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function showError(message: string) {
	status.classList.add("error");
	status.textContent = message;
}

function requiredElement<T extends HTMLElement>(id: string) {
	const element = document.getElementById(id);
	if (!element) throw new Error(`Missing #${id}.`);
	return element as T;
}
