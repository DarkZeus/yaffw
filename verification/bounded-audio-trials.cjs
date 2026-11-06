async function collectBoundedAudioEvidence({ revision, pollPresentation }) {
	const {
		inspectProductionAudioFixture,
		runProductionAudioTrial,
		runProductionAudioFunctionalChecks,
		evaluateProductionAudioTrials,
	} = await import(
		"/src/editor-next/audio/harness/production-audio-evidence.ts"
	);
	const file = document.querySelector("#fixture").files[0];
	const { asset, fixture } = await inspectProductionAudioFixture(file);
	const functional = await runProductionAudioFunctionalChecks(file, revision);
	const trials = [];
	for (let trialNumber = 1; trialNumber <= 5; trialNumber++) {
		trials.push(
			await runProductionAudioTrial({
				file,
				asset,
				trialNumber,
				pollPresentation,
			}),
		);
		await window.reportTrial(trialNumber);
	}
	return {
		recordedAt: new Date().toISOString(),
		revision,
		fixture,
		functional,
		trials,
		evaluation: evaluateProductionAudioTrials(trials),
		userAgent: navigator.userAgent,
		limitation:
			"New 40-second two-stereo-AAC continuous fixture; preserves existing numerical gates but is not the historical #109 controlled fixture comparison.",
	};
}

module.exports = { collectBoundedAudioEvidence };
