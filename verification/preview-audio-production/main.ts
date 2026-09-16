import {
	type ProductionAudioTrial,
	runProductionAudioEvidence,
	runProductionAudioFunctionalChecks,
	runProductionAudioGapChecks,
} from "../../src/editor-next/audio/harness/production-audio-evidence";

const fixture = required<HTMLInputElement>("fixture");
const revision = required<HTMLInputElement>("revision");
const run = required<HTMLButtonElement>("run");
const functional = required<HTMLButtonElement>("functional");
const gaps = required<HTMLButtonElement>("gaps");
const download = required<HTMLButtonElement>("download");
const status = required<HTMLParagraphElement>("status");
const json = required<HTMLPreElement>("json");
const latest: {
	performance?: Awaited<ReturnType<typeof runProductionAudioEvidence>>;
	functional?: Awaited<ReturnType<typeof runProductionAudioFunctionalChecks>>;
	gaps?: Awaited<ReturnType<typeof runProductionAudioGapChecks>>;
	partialTrials?: ProductionAudioTrial[];
	errors: string[];
} = { errors: [] };

async function execute(kind: "trials" | "functional" | "gaps") {
	const file = fixture.files?.[0];
	if (!file) {
		status.textContent = "Select the fixture first.";
		return;
	}
	run.disabled = true;
	functional.disabled = true;
	gaps.disabled = true;
	download.disabled = true;
	status.classList.remove("error");
	status.textContent =
		kind === "trials"
			? "Running five 30-second production trials…"
			: "Running production functional checks…";
	try {
		if (kind === "trials") {
			latest.partialTrials = [];
			const record = await runProductionAudioEvidence({
				file,
				revision: revision.value,
				onTrial(trial) {
					latest.partialTrials?.push(trial);
					status.textContent = `Completed ${trial.trialNumber} / 5 trials. Ready: ${trial.readinessMs.toFixed(1)} ms; peak PCM: ${trial.beforeCleanup.engine.peakRetainedPcmBytes}; underruns: ${trial.beforeCleanup.engine.underruns}.`;
					json.textContent = JSON.stringify(latest, null, 2);
				},
			});
			latest.performance = record;
			latest.partialTrials = undefined;
			status.textContent = record.evaluation.passed
				? "All production performance gates passed."
				: "Production evidence recorded with failed gates. See JSON.";
			status.classList.toggle("error", !record.evaluation.passed);
		} else if (kind === "functional") {
			const record = await runProductionAudioFunctionalChecks(
				file,
				revision.value,
			);
			latest.functional = record;
			status.textContent = `${record.operations.filter((operation) => operation.passed).length} / ${record.operations.length} production functional checks passed.`;
			status.classList.toggle("error", !record.passed);
		} else {
			const record = await runProductionAudioGapChecks(file, revision.value);
			latest.gaps = record;
			status.textContent = `${record.probes.filter((probe) => probe.passed).length} / ${record.probes.length} production offset/gap probes passed.`;
			status.classList.toggle("error", !record.passed);
		}
		json.textContent = JSON.stringify(latest, null, 2);
		download.disabled = false;
	} catch (error) {
		status.classList.add("error");
		status.textContent = error instanceof Error ? error.message : String(error);
		latest.errors.push(
			error instanceof Error ? (error.stack ?? error.message) : String(error),
		);
		json.textContent = JSON.stringify(latest, null, 2);
		download.disabled = false;
	} finally {
		run.disabled = false;
		functional.disabled = false;
		gaps.disabled = false;
	}
}

run.addEventListener("click", () => void execute("trials"));
functional.addEventListener("click", () => void execute("functional"));
gaps.addEventListener("click", () => void execute("gaps"));
download.addEventListener("click", () => {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(latest, null, 2)], { type: "application/json" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `preview-audio-production-${new Date().toISOString().replaceAll(":", "-")}.json`;
	anchor.click();
	URL.revokeObjectURL(url);
});

function required<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) throw new Error(`Missing #${id}.`);
	return element as T;
}
