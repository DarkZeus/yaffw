import type { WaveformSamples } from "./selection-waveform-lanes.types";

export function createWavesurferPeaksFromSamples(samples: WaveformSamples) {
	if (samples.length === 0) {
		return new Float32Array([0]);
	}

	return Float32Array.from(samples, (sample) => clampAmplitude(sample));
}

function clampAmplitude(sample: number) {
	if (!Number.isFinite(sample) || sample <= 0) {
		return 0;
	}

	if (sample >= 1) {
		return 1;
	}

	return sample;
}
