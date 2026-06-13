import {
	ALL_FORMATS,
	AdtsOutputFormat,
	AudioBufferSource,
	AudioSampleSink,
	AudioSampleSource,
	BlobSource,
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	FlacOutputFormat,
	Input,
	Mp3OutputFormat,
	Mp4OutputFormat,
	OggOutputFormat,
	Output,
	WavOutputFormat,
	WebMOutputFormat,
} from "mediabunny";

const fileInput = document.querySelector("#file");
const prepareButton = document.querySelector("#prepare");
const playAllButton = document.querySelector("#play-all");
const stopAllButton = document.querySelector("#stop-all");
const peakCeilingSelect = document.querySelector("#peak-ceiling");
const copyStateButton = document.querySelector("#copy-state");
const copyStateStatusElement = document.querySelector("#copy-state-status");
const mixdownElement = document.querySelector("#mixdown");
const tracksElement = document.querySelector("#tracks");
const stateElement = document.querySelector("#state");

const CHANNEL_TRANSFORM_MODES = [
	{
		label: "Auto repair one-sided stereo",
		value: "auto-one-sided-stereo",
	},
	{
		label: "Use left as mono",
		value: "use-left-as-mono",
	},
	{
		label: "Use right as mono",
		value: "use-right-as-mono",
	},
	{
		label: "Duplicate left to stereo",
		value: "duplicate-left-to-stereo",
	},
	{
		label: "Duplicate right to stereo",
		value: "duplicate-right-to-stereo",
	},
	{
		label: "Average channels to mono",
		value: "average-to-mono",
	},
];

const ONE_SIDED_ACTIVE_PEAK_THRESHOLD = 0.001;
const ONE_SIDED_ACTIVE_RMS_THRESHOLD = 0.0001;
const ONE_SIDED_RELATIVE_SILENCE_RATIO = 0.01;
const DEFAULT_PEAK_SAFETY_TARGET_DB = -1;
const TRANSFORMED_AAC_BITRATE = 192_000;

const MERGE_CHANNEL_MODES = [
	{
		label: "Preserve channels",
		value: "preserve",
	},
	...CHANNEL_TRANSFORM_MODES,
];

let selectedFile = null;
let activeInput = null;
let preparedAudioTracks = new Map();
let liveUrls = [];
let state = {
	file: null,
	mixdown: createIdleMixdownState(),
	note: "PROTOTYPE - throwaway browser spike",
	results: [],
	settings: createDefaultPrototypeSettings(),
	status: "idle",
};

fileInput.addEventListener("change", () => {
	revokeLiveUrls();
	activeInput = null;
	preparedAudioTracks = new Map();
	selectedFile = fileInput.files?.[0] ?? null;
	state = {
		file: selectedFile
			? {
					name: selectedFile.name,
					sizeBytes: selectedFile.size,
					type: selectedFile.type || "(unknown)",
				}
			: null,
		mixdown: createIdleMixdownState(),
		note: "PROTOTYPE - throwaway browser spike",
		results: [],
		settings: state.settings,
		status: selectedFile ? "file-selected" : "idle",
	};
	prepareButton.disabled = !selectedFile;
	playAllButton.disabled = true;
	stopAllButton.disabled = true;
	render();
});

prepareButton.addEventListener("click", async () => {
	if (!selectedFile) {
		return;
	}

	revokeLiveUrls();
	activeInput = null;
	preparedAudioTracks = new Map();
	state = {
		...state,
		mixdown: createIdleMixdownState(),
		results: [],
		status: "reading-input",
	};
	render();

	try {
		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(selectedFile),
		});
		activeInput = input;
		const audioTracks = await input.getAudioTracks();

		state = {
			...state,
			audioTrackCount: audioTracks.length,
			status: "preparing-tracks",
		};
		render();

		const results = [];
		for (const [index, track] of audioTracks.entries()) {
			const metadata = await describeTrack(track, index);
			preparedAudioTracks.set(metadata.number, track);
			state.results = [
				...results,
				{
					metadata,
					status: "preparing",
				},
			];
			render();

			const result = withPrototypeTrackSettings(
				await prepareTrackSource(track, metadata),
			);
			results.push(result);
			state.results = [...results];
			state.mixdown = createMixdownStateForResults(results);
			render();
		}

		state = {
			...state,
			mixdown: createMixdownStateForResults(results),
			results,
			status: "ready",
		};
		playAllButton.disabled = results.every(
			(result) => result.status !== "ready",
		);
		stopAllButton.disabled = playAllButton.disabled;
		render();
	} catch (error) {
		state = {
			...state,
			error: formatError(error),
			status: "failed",
		};
		render();
	}
});

playAllButton.addEventListener("click", async () => {
	const audioElements = Array.from(
		document.querySelectorAll('audio[data-play-group="prepared-track"]'),
	);
	for (const audio of audioElements) {
		audio.currentTime = 0;
	}
	await Promise.allSettled(audioElements.map((audio) => audio.play()));
});

stopAllButton.addEventListener("click", () => {
	for (const audio of document.querySelectorAll("audio")) {
		audio.pause();
		audio.currentTime = 0;
	}
});

peakCeilingSelect.addEventListener("change", () => {
	state = {
		...state,
		mixdown: {
			...state.mixdown,
			result: null,
		},
		settings: {
			...state.settings,
			peakSafetyTargetDb: Number(peakCeilingSelect.value),
		},
	};
	render();
});

copyStateButton.addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(stateElement.textContent ?? "");
		copyStateStatusElement.textContent = "Copied";
		window.setTimeout(() => {
			copyStateStatusElement.textContent = "";
		}, 1500);
	} catch (error) {
		copyStateStatusElement.textContent = formatError(error).message;
	}
});

function createDefaultPrototypeSettings() {
	return {
		peakSafetyTargetDb: DEFAULT_PEAK_SAFETY_TARGET_DB,
	};
}

function createIdleMixdownState() {
	return {
		outputChannels: 2,
		result: null,
		status: "idle",
		tracks: {},
	};
}

function createMixdownStateForResults(results, previous = state.mixdown) {
	return {
		outputChannels: previous?.outputChannels ?? 2,
		result: previous?.result ?? null,
		status:
			previous?.status === "mixing" ? "ready" : (previous?.status ?? "idle"),
		tracks: Object.fromEntries(
			results.map((result) => {
				const trackNumber = String(result.metadata.number);
				return [
					trackNumber,
					{
						channelMode:
							previous?.tracks?.[trackNumber]?.channelMode ?? "preserve",
						include:
							previous?.tracks?.[trackNumber]?.include ??
							result.status === "ready",
					},
				];
			}),
		),
	};
}

function withPrototypeTrackSettings(result) {
	const prototypeSettings = {
		channelMode: "auto-one-sided-stereo",
		...(result.prototypeSettings ?? {}),
	};

	return {
		...result,
		derivedSources: result.derivedSources ?? [],
		prototypeSettings: {
			...prototypeSettings,
			channelMode: normalizeChannelMode(prototypeSettings.channelMode),
		},
	};
}

async function describeTrack(track, index) {
	const durationSeconds = await track.computeDuration().catch(() => null);
	const firstTimestampSeconds = await track
		.getFirstTimestamp()
		.catch(() => null);
	const decoderConfig = await track.getDecoderConfig().catch(() => null);
	const canDecode = await track.canDecode().catch(() => false);

	return {
		canDecode,
		codec: track.codec,
		codecParameterString: await track
			.getCodecParameterString()
			.catch(() => null),
		decoderConfig,
		durationSeconds,
		firstTimestampSeconds,
		id: track.id,
		internalCodecId: track.internalCodecId,
		languageCode: track.languageCode,
		name: track.name,
		number: index + 1,
		numberOfChannels: track.numberOfChannels,
		sampleRate: track.sampleRate,
		suggestedMultitrackStartPositionSeconds: Math.max(
			0,
			firstTimestampSeconds ?? 0,
		),
	};
}

async function prepareTrackSource(track, metadata) {
	const attempts = [];

	for (const candidate of remuxCandidatesForCodec(metadata.codec)) {
		const attempt = await tryRemuxCandidate(track, metadata, candidate);
		attempts.push(attempt);

		if (attempt.status === "ready") {
			return {
				attempts,
				metadata,
				status: "ready",
				strategy: "same-codec-remux",
				source: attempt.source,
			};
		}
	}

	const fallback = await tryWavFallback(track, metadata);
	attempts.push(fallback);

	if (fallback.status === "ready") {
		return {
			attempts,
			metadata,
			status: "ready",
			strategy: "decoded-wav-fallback",
			source: fallback.source,
		};
	}

	return {
		attempts,
		metadata,
		status: "failed",
	};
}

async function tryRemuxCandidate(track, metadata, candidate) {
	try {
		if (!metadata.codec) {
			throw new Error("Track codec is unknown.");
		}

		const format = candidate.createFormat();
		if (!format.getSupportedAudioCodecs().includes(metadata.codec)) {
			throw new Error(`${candidate.label} does not support ${metadata.codec}.`);
		}

		const { buffer, packetCount } = await copyEncodedTrackToBuffer({
			format,
			metadata,
			track,
		});
		const blob = new Blob([buffer], { type: candidate.mimeType });
		const source = await createPlayableSourceFromBlob({
			blob,
			downloadName: `track-${metadata.number}-${candidate.label}${candidate.extension}`,
			mimeType: candidate.mimeType,
		});

		return {
			label: candidate.label,
			packetCount,
			source,
			status: "ready",
		};
	} catch (error) {
		return {
			error: formatError(error),
			label: candidate.label,
			status: "failed",
		};
	}
}

async function tryWavFallback(track, metadata) {
	try {
		if (!metadata.canDecode) {
			throw new Error("Track is not decodable in this browser.");
		}

		const format = new WavOutputFormat();
		const target = new BufferTarget();
		const output = new Output({ format, target });
		const sampleSource = new AudioSampleSource({ codec: "pcm-s16" });
		output.addAudioTrack(sampleSource, trackMetadata(metadata));
		await output.start();

		let sampleCount = 0;
		const sink = new AudioSampleSink(track);
		for await (const sample of sink.samples()) {
			await sampleSource.add(sample);
			sample.close();
			sampleCount += 1;
		}

		sampleSource.close();
		await output.finalize();

		if (!target.buffer) {
			throw new Error("WAV output produced no buffer.");
		}

		const blob = new Blob([target.buffer], { type: "audio/wav" });
		const playableSource = await createPlayableSourceFromBlob({
			blob,
			downloadName: `track-${metadata.number}-wav-fallback.wav`,
			mimeType: "audio/wav",
		});

		return {
			label: "wav-fallback",
			sampleCount,
			source: playableSource,
			status: "ready",
		};
	} catch (error) {
		return {
			error: formatError(error),
			label: "wav-fallback",
			status: "failed",
		};
	}
}

async function copyEncodedTrackToBuffer({ format, metadata, track }) {
	const target = new BufferTarget();
	const output = new Output({ format, target });
	const source = new EncodedAudioPacketSource(metadata.codec);
	output.addAudioTrack(source, trackMetadata(metadata));
	await output.start();

	const sink = new EncodedPacketSink(track);
	const decoderConfig = await track.getDecoderConfig().catch(() => null);
	const firstTimestamp = metadata.firstTimestampSeconds ?? 0;
	const shiftSeconds = Number.isFinite(firstTimestamp) ? firstTimestamp : 0;
	let packetCount = 0;

	for await (const packet of sink.packets()) {
		const normalizedPacket =
			shiftSeconds === 0
				? packet
				: packet.clone({
						timestamp: packet.timestamp - shiftSeconds,
					});
		await source.add(normalizedPacket, {
			decoderConfig: decoderConfig ?? undefined,
		});
		packetCount += 1;
	}

	source.close();
	await output.finalize();

	if (!target.buffer) {
		throw new Error("Remux output produced no buffer.");
	}

	return {
		buffer: target.buffer,
		packetCount,
	};
}

function remuxCandidatesForCodec(codec) {
	if (!codec) {
		return [];
	}

	const mp4Candidate = {
		createFormat: () => new Mp4OutputFormat({ fastStart: "in-memory" }),
		extension: codec === "aac" ? ".m4a" : ".mp4",
		label: "audio-only-mp4",
		mimeType: "audio/mp4",
	};

	if (codec === "aac") {
		return [
			mp4Candidate,
			{
				createFormat: () => new AdtsOutputFormat(),
				extension: ".aac",
				label: "adts-aac",
				mimeType: "audio/aac",
			},
		];
	}

	if (codec === "mp3") {
		return [
			{
				createFormat: () => new Mp3OutputFormat(),
				extension: ".mp3",
				label: "mp3",
				mimeType: "audio/mpeg",
			},
			mp4Candidate,
		];
	}

	if (codec === "opus" || codec === "vorbis") {
		return [
			{
				createFormat: () => new WebMOutputFormat(),
				extension: ".webm",
				label: "audio-only-webm",
				mimeType: "audio/webm",
			},
			{
				createFormat: () => new OggOutputFormat(),
				extension: ".ogg",
				label: "ogg",
				mimeType: "audio/ogg",
			},
		];
	}

	if (codec === "flac") {
		return [
			{
				createFormat: () => new FlacOutputFormat(),
				extension: ".flac",
				label: "flac",
				mimeType: "audio/flac",
			},
			mp4Candidate,
		];
	}

	if (codec.startsWith("pcm-") || codec === "ulaw" || codec === "alaw") {
		return [
			{
				createFormat: () => new WavOutputFormat(),
				extension: ".wav",
				label: "wav-same-codec",
				mimeType: "audio/wav",
			},
		];
	}

	return [mp4Candidate];
}

function trackMetadata(metadata) {
	return {
		languageCode:
			metadata.languageCode && metadata.languageCode !== "und"
				? metadata.languageCode
				: undefined,
		name: metadata.name ?? undefined,
	};
}

async function createPlayableSourceFromBlob({ blob, downloadName, mimeType }) {
	const playable = await createPlayableUrl(blob);

	if (!playable.ok) {
		throw new Error(playable.reason);
	}

	return {
		blob,
		byteLength: blob.size,
		downloadName,
		mimeType,
		url: playable.url,
	};
}

function createPlayableUrl(blob) {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(blob);
		const audio = new Audio();
		const timeout = window.setTimeout(() => {
			cleanup();
			URL.revokeObjectURL(url);
			resolve({
				ok: false,
				reason: "Timed out waiting for browser audio metadata.",
			});
		}, 5000);

		function cleanup() {
			window.clearTimeout(timeout);
			audio.removeEventListener("canplay", handleCanPlay);
			audio.removeEventListener("loadedmetadata", handleCanPlay);
			audio.removeEventListener("error", handleError);
			audio.removeAttribute("src");
			audio.load();
		}

		function handleCanPlay() {
			cleanup();
			liveUrls.push(url);
			resolve({ ok: true, url });
		}

		function handleError() {
			const reason =
				audio.error?.message ??
				`Browser rejected source with media error code ${audio.error?.code ?? "unknown"}.`;
			cleanup();
			URL.revokeObjectURL(url);
			resolve({ ok: false, reason });
		}

		audio.preload = "metadata";
		audio.addEventListener("canplay", handleCanPlay, { once: true });
		audio.addEventListener("loadedmetadata", handleCanPlay, { once: true });
		audio.addEventListener("error", handleError, { once: true });
		audio.src = url;
	});
}

function revokeLiveUrls() {
	for (const url of liveUrls) {
		URL.revokeObjectURL(url);
	}
	liveUrls = [];
}

async function createDerivedSourcesForTrack(trackNumber, channelMode) {
	const result = state.results.find(
		(candidate) => candidate.metadata.number === trackNumber,
	);
	if (!result || result.status !== "ready") {
		return;
	}

	result.derivedSources = [
		...(result.derivedSources ?? []),
		{
			channelMode,
			status: "preparing",
			strategy: "decoded-channel-transform",
		},
	];
	state.status = "creating-channel-transform";
	render();

	const derivedIndex = result.derivedSources.length - 1;
	try {
		const decoded = await decodePreparedTrackForTransform(result);
		const channelTransform = resolveChannelTransform(
			decoded.audioBuffer,
			channelMode,
		);
		const transformedBuffer = createTransformedAudioBuffer(
			decoded.audioBuffer,
			{
				channelMode: channelTransform.resolvedMode,
				outputChannels: outputChannelCountForMode(
					decoded.audioBuffer,
					channelTransform.resolvedMode,
				),
			},
		);
		const channelCompensated = createChannelCompensatedAudioBuffer({
			channelTransform,
			inputBuffer: decoded.audioBuffer,
			outputBuffer: transformedBuffer,
		});
		const peakSafe = createPeakSafeAudioBuffer(channelCompensated.audioBuffer);
		const sharedOutput = {
			channelMode,
			channelCompensation: channelCompensated.stats,
			channelTransform,
			compensated: describeAudioBuffer(channelCompensated.audioBuffer),
			compensatedSampleAnalysis: analyzeAudioBufferSamples(
				channelCompensated.audioBuffer,
			),
			decoded: decoded.stats,
			output: describeAudioBuffer(peakSafe.audioBuffer),
			outputSampleAnalysis: analyzeAudioBufferSamples(peakSafe.audioBuffer),
			peakSafety: peakSafe.stats,
			transformed: describeAudioBuffer(transformedBuffer),
			transformedSampleAnalysis: analyzeAudioBufferSamples(transformedBuffer),
		};
		const derivedSources = [
			await createDerivedM4aSource({
				audioBuffer: peakSafe.audioBuffer,
				channelMode,
				sharedOutput,
				trackNumber,
			}),
			await createDerivedWavDebugSource({
				audioBuffer: peakSafe.audioBuffer,
				channelMode,
				peakSafetyStats: peakSafe.stats,
				sharedOutput,
				trackNumber,
			}),
		];

		result.derivedSources.splice(derivedIndex, 1, ...derivedSources);
		state.status = "ready";
	} catch (error) {
		result.derivedSources[derivedIndex] = {
			channelMode,
			error: formatError(error),
			status: "failed",
			strategy: "decoded-channel-transform",
		};
		state.status = "ready";
	}

	render();
}

async function createDerivedM4aSource({
	audioBuffer,
	channelMode,
	sharedOutput,
	trackNumber,
}) {
	try {
		const m4a = await audioBufferToM4aBlob(audioBuffer);
		const source = await createPlayableSourceFromBlob({
			blob: m4a.blob,
			downloadName: `track-${trackNumber}-${channelMode}.m4a`,
			mimeType: "audio/mp4",
		});

		return {
			...sharedOutput,
			aac: m4a.stats,
			source,
			status: "ready",
			strategy: "decoded-channel-transform-aac-m4a",
		};
	} catch (error) {
		return {
			...sharedOutput,
			error: formatError(error),
			status: "failed",
			strategy: "decoded-channel-transform-aac-m4a",
		};
	}
}

async function createDerivedWavDebugSource({
	audioBuffer,
	channelMode,
	peakSafetyStats,
	sharedOutput,
	trackNumber,
}) {
	try {
		const wav = audioBufferToWavBlob(audioBuffer, peakSafetyStats);
		const source = await createPlayableSourceFromBlob({
			blob: wav.blob,
			downloadName: `track-${trackNumber}-${channelMode}-debug.wav`,
			mimeType: "audio/wav",
		});

		return {
			...sharedOutput,
			source,
			status: "ready",
			strategy: "decoded-channel-transform-wav-debug",
			wav: wav.stats,
		};
	} catch (error) {
		return {
			...sharedOutput,
			error: formatError(error),
			status: "failed",
			strategy: "decoded-channel-transform-wav-debug",
		};
	}
}

async function createMergedSources() {
	const readyResults = state.results.filter(
		(result) => result.status === "ready",
	);
	const selectedResults = readyResults.filter(
		(result) => state.mixdown.tracks[String(result.metadata.number)]?.include,
	);

	if (selectedResults.length === 0) {
		state.mixdown = {
			...state.mixdown,
			error: {
				message: "Select at least one prepared track before mixing.",
				name: "PrototypeMixdownError",
			},
			status: "failed",
		};
		render();
		return;
	}

	state.mixdown = {
		...state.mixdown,
		error: undefined,
		result: null,
		status: "mixing",
	};
	render();

	try {
		const decodedTracks = [];
		for (const result of selectedResults) {
			const settings = state.mixdown.tracks[String(result.metadata.number)];
			const decoded = await decodePreparedTrackForTransform(result);
			const channelTransform = resolveChannelTransform(
				decoded.audioBuffer,
				settings?.channelMode ?? "preserve",
			);
			decodedTracks.push({
				channelMode: channelTransform.resolvedMode,
				channelTransform,
				decoded: decoded.audioBuffer,
				decodedStats: decoded.stats,
				metadata: result.metadata,
				startPositionSeconds:
					result.metadata.suggestedMultitrackStartPositionSeconds ?? 0,
			});
		}

		const outputChannels = Number(state.mixdown.outputChannels) === 1 ? 1 : 2;
		const rendered = await renderMixdownAudioBuffer({
			outputChannels,
			tracks: decodedTracks,
		});
		const peakSafe = createPeakSafeAudioBuffer(rendered);
		const mergeName = `merged-${selectedResults.map((result) => result.metadata.number).join("-")}-${outputChannels}ch`;
		const sharedOutput = {
			output: describeAudioBuffer(peakSafe.audioBuffer),
			outputSampleAnalysis: analyzeAudioBufferSamples(peakSafe.audioBuffer),
			peakSafety: peakSafe.stats,
			rendered: describeAudioBuffer(rendered),
			renderedSampleAnalysis: analyzeAudioBufferSamples(rendered),
		};

		state.mixdown = {
			...state.mixdown,
			result: {
				inputs: decodedTracks.map((track) => ({
					channelMode: track.channelTransform.requestedMode,
					channelCompensation: track.channelCompensation,
					channelTransform: track.channelTransform,
					compensated: track.compensated,
					compensatedSampleAnalysis: track.compensatedSampleAnalysis,
					decoded: track.decodedStats,
					name: track.metadata.name,
					number: track.metadata.number,
					startPositionSeconds: track.startPositionSeconds,
					transformed: track.transformed,
					transformedSampleAnalysis: track.transformedSampleAnalysis,
				})),
				...sharedOutput,
				outputs: [
					await createMixdownM4aSource({
						audioBuffer: peakSafe.audioBuffer,
						mergeName,
						sharedOutput,
					}),
					await createMixdownWavDebugSource({
						audioBuffer: peakSafe.audioBuffer,
						mergeName,
						peakSafetyStats: peakSafe.stats,
						sharedOutput,
					}),
				],
				strategy: "decoded-offline-mixdown",
			},
			status: "ready",
		};
	} catch (error) {
		state.mixdown = {
			...state.mixdown,
			error: formatError(error),
			status: "failed",
		};
	}

	render();
}

async function createMixdownM4aSource({
	audioBuffer,
	mergeName,
	sharedOutput,
}) {
	try {
		const m4a = await audioBufferToM4aBlob(audioBuffer);
		const source = await createPlayableSourceFromBlob({
			blob: m4a.blob,
			downloadName: `${mergeName}.m4a`,
			mimeType: "audio/mp4",
		});

		return {
			...sharedOutput,
			aac: m4a.stats,
			source,
			status: "ready",
			strategy: "decoded-offline-mixdown-aac-m4a",
		};
	} catch (error) {
		return {
			...sharedOutput,
			error: formatError(error),
			status: "failed",
			strategy: "decoded-offline-mixdown-aac-m4a",
		};
	}
}

async function createMixdownWavDebugSource({
	audioBuffer,
	mergeName,
	peakSafetyStats,
	sharedOutput,
}) {
	try {
		const wav = audioBufferToWavBlob(audioBuffer, peakSafetyStats);
		const source = await createPlayableSourceFromBlob({
			blob: wav.blob,
			downloadName: `${mergeName}-debug.wav`,
			mimeType: "audio/wav",
		});

		return {
			...sharedOutput,
			source,
			status: "ready",
			strategy: "decoded-offline-mixdown-wav-debug",
			wav: wav.stats,
		};
	} catch (error) {
		return {
			...sharedOutput,
			error: formatError(error),
			status: "failed",
			strategy: "decoded-offline-mixdown-wav-debug",
		};
	}
}

async function decodePreparedTrackForTransform(result) {
	const track = preparedAudioTracks.get(result.metadata.number);
	if (!track || !activeInput) {
		const audioBuffer = await decodeAudioSource(result.source);
		return {
			audioBuffer,
			stats: {
				...describeAudioBuffer(audioBuffer),
				decodeSource: "preview-blob-audio-context-fallback",
				sampleAnalysis: analyzeAudioBufferSamples(audioBuffer),
			},
		};
	}

	return decodeOriginalTrackToAudioBuffer(track, result.metadata);
}

async function decodeOriginalTrackToAudioBuffer(track, metadata) {
	const sink = new AudioSampleSink(track);
	const chunks = [];
	let sampleRate = metadata.sampleRate || null;
	let numberOfChannels = metadata.numberOfChannels || 0;
	let firstTimestampSeconds = Number.POSITIVE_INFINITY;
	let lastTimestampSeconds = Number.NEGATIVE_INFINITY;

	for await (const sample of sink.samples()) {
		const buffer = sample.toAudioBuffer();
		const { timestamp } = sample;
		if (!sampleRate) {
			sampleRate = buffer.sampleRate;
		}
		if (buffer.sampleRate !== sampleRate) {
			throw new Error(
				`Decoded sample rate changed from ${sampleRate}Hz to ${buffer.sampleRate}Hz.`,
			);
		}

		numberOfChannels = Math.max(numberOfChannels, buffer.numberOfChannels);
		firstTimestampSeconds = Math.min(firstTimestampSeconds, timestamp);
		lastTimestampSeconds = Math.max(
			lastTimestampSeconds,
			timestamp + buffer.duration,
		);
		chunks.push({
			buffer,
			timestamp,
		});
		sample.close();
	}

	if (chunks.length === 0 || !sampleRate || numberOfChannels === 0) {
		throw new Error("Original audio track produced no decoded buffers.");
	}

	const trackStartSeconds = Number.isFinite(metadata.firstTimestampSeconds)
		? metadata.firstTimestampSeconds
		: firstTimestampSeconds;
	const frameSpans = chunks.map(({ buffer, timestamp }) => {
		const frameOffset = Math.max(
			0,
			Math.round((timestamp - trackStartSeconds) * sampleRate),
		);
		return {
			buffer,
			frameOffset,
			frameEnd: frameOffset + buffer.length,
		};
	});
	const length = Math.max(...frameSpans.map((span) => span.frameEnd));
	const audioBuffer = createAudioBuffer({
		length,
		numberOfChannels,
		sampleRate,
	});

	for (const { buffer, frameOffset } of frameSpans) {
		for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
			const channelData = new Float32Array(buffer.length);
			buffer.copyFromChannel(channelData, channel);
			audioBuffer.copyToChannel(channelData, channel, frameOffset);
		}
	}

	return {
		audioBuffer,
		stats: {
			...describeAudioBuffer(audioBuffer),
			bufferCount: chunks.length,
			decodeSource: "original-track-audio-buffer-sink",
			firstDecodedTimestampSeconds: firstTimestampSeconds,
			lastDecodedTimestampSeconds: lastTimestampSeconds,
			normalizedStartTimestampSeconds: trackStartSeconds,
			sampleAnalysis: analyzeAudioBufferSamples(audioBuffer),
		},
	};
}

async function decodeAudioSource(source) {
	if (!source.blob) {
		throw new Error("Prepared source does not carry its Blob.");
	}

	const AudioContextConstructor =
		window.AudioContext ?? window.webkitAudioContext;
	if (!AudioContextConstructor) {
		throw new Error("AudioContext is not available in this browser.");
	}

	const context = new AudioContextConstructor();
	try {
		const buffer = await source.blob.arrayBuffer();
		return await context.decodeAudioData(buffer.slice(0));
	} finally {
		await context.close?.();
	}
}

async function renderMixdownAudioBuffer({ outputChannels, tracks }) {
	const firstTrack = tracks[0];
	const sampleRate = firstTrack.decoded.sampleRate;
	const durationSeconds = tracks.reduce(
		(maxDuration, track) =>
			Math.max(
				maxDuration,
				track.startPositionSeconds + track.decoded.duration,
			),
		0,
	);
	const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));
	const context = new OfflineAudioContext(
		outputChannels,
		frameCount,
		sampleRate,
	);

	for (const track of tracks) {
		const source = context.createBufferSource();
		const transformedBuffer = createTransformedAudioBuffer(track.decoded, {
			channelMode: track.channelMode,
			outputChannels,
		});
		const channelCompensated = createChannelCompensatedAudioBuffer({
			channelTransform: track.channelTransform,
			inputBuffer: track.decoded,
			outputBuffer: transformedBuffer,
		});
		track.channelCompensation = channelCompensated.stats;
		track.compensated = describeAudioBuffer(channelCompensated.audioBuffer);
		track.compensatedSampleAnalysis = analyzeAudioBufferSamples(
			channelCompensated.audioBuffer,
		);
		track.transformed = describeAudioBuffer(transformedBuffer);
		track.transformedSampleAnalysis =
			analyzeAudioBufferSamples(transformedBuffer);
		source.buffer = channelCompensated.audioBuffer;
		source.connect(context.destination);
		source.start(Math.max(0, track.startPositionSeconds));
	}

	return await context.startRendering();
}

function createTransformedAudioBuffer(
	audioBuffer,
	{ channelMode, outputChannels },
) {
	const transformed = createAudioBuffer({
		length: audioBuffer.length,
		numberOfChannels: outputChannels,
		sampleRate: audioBuffer.sampleRate,
	});

	if (channelMode === "preserve") {
		if (outputChannels === 1) {
			const mono = averageChannels(audioBuffer);
			transformed.copyToChannel(mono, 0);
			return transformed;
		}

		for (let channel = 0; channel < outputChannels; channel += 1) {
			const sourceChannel = Math.min(channel, audioBuffer.numberOfChannels - 1);
			transformed.copyToChannel(
				audioBuffer.getChannelData(sourceChannel),
				channel,
			);
		}
		return transformed;
	}

	if (
		channelMode === "use-left-as-mono" ||
		channelMode === "duplicate-left-to-stereo"
	) {
		copySourceChannelToAllOutputs(audioBuffer, transformed, 0);
		return transformed;
	}

	if (
		channelMode === "use-right-as-mono" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		copySourceChannelToAllOutputs(
			audioBuffer,
			transformed,
			Math.min(1, audioBuffer.numberOfChannels - 1),
		);
		return transformed;
	}

	if (channelMode === "average-to-mono") {
		const mono = averageChannels(audioBuffer);
		for (let channel = 0; channel < outputChannels; channel += 1) {
			transformed.copyToChannel(mono, channel);
		}
		return transformed;
	}

	return createTransformedAudioBuffer(audioBuffer, {
		channelMode: "preserve",
		outputChannels,
	});
}

function outputChannelCountForMode(audioBuffer, channelMode) {
	if (
		channelMode === "duplicate-left-to-stereo" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		return Math.max(2, audioBuffer.numberOfChannels);
	}

	if (channelMode === "preserve") {
		return audioBuffer.numberOfChannels;
	}

	return 1;
}

function copySourceChannelToAllOutputs(
	audioBuffer,
	transformed,
	sourceChannel,
) {
	const sourceData = audioBuffer.getChannelData(sourceChannel);
	for (let channel = 0; channel < transformed.numberOfChannels; channel += 1) {
		transformed.copyToChannel(sourceData, channel);
	}
}

function resolveChannelTransform(audioBuffer, requestedMode) {
	const requestedModeWithAliases = normalizeChannelMode(requestedMode);
	const analysis = analyzeChannelActivity(audioBuffer);

	if (requestedModeWithAliases !== "auto-one-sided-stereo") {
		return {
			analysis,
			requestedMode,
			resolvedMode: requestedModeWithAliases,
		};
	}

	if (analysis.oneSidedStereo === "left-active") {
		return {
			analysis,
			requestedMode,
			resolvedMode: "use-left-as-mono",
		};
	}

	if (analysis.oneSidedStereo === "right-active") {
		return {
			analysis,
			requestedMode,
			resolvedMode: "use-right-as-mono",
		};
	}

	return {
		analysis,
		requestedMode,
		resolvedMode: "preserve",
	};
}

function normalizeChannelMode(channelMode) {
	if (channelMode === "fill-right-from-left") {
		return "duplicate-left-to-stereo";
	}
	if (channelMode === "fill-left-from-right") {
		return "duplicate-right-to-stereo";
	}
	if (channelMode === "left-to-mono") {
		return "use-left-as-mono";
	}
	if (channelMode === "right-to-mono") {
		return "use-right-as-mono";
	}
	return channelMode ?? "preserve";
}

function analyzeChannelActivity(audioBuffer) {
	const channels = Array.from(
		{ length: audioBuffer.numberOfChannels },
		(_, channel) => analyzeChannel(audioBuffer.getChannelData(channel)),
	);

	if (channels.length < 2) {
		return {
			channels,
			oneSidedStereo: null,
			reason: "less-than-two-channels",
		};
	}

	const left = channels[0];
	const right = channels[1];
	const leftActive = isChannelActive(left);
	const rightActive = isChannelActive(right);
	const leftSilentComparedToRight = isChannelSilentComparedTo(left, right);
	const rightSilentComparedToLeft = isChannelSilentComparedTo(right, left);

	if (leftActive && rightSilentComparedToLeft) {
		return {
			channels,
			oneSidedStereo: "left-active",
			reason: "left-active-right-silent",
		};
	}

	if (rightActive && leftSilentComparedToRight) {
		return {
			channels,
			oneSidedStereo: "right-active",
			reason: "right-active-left-silent",
		};
	}

	return {
		channels,
		oneSidedStereo: null,
		reason:
			leftActive || rightActive ? "both-channels-have-signal" : "both-silent",
	};
}

function analyzeChannel(channelData) {
	let peak = 0;
	let squareSum = 0;

	for (const sample of channelData) {
		const absoluteSample = Math.abs(sample);
		peak = Math.max(peak, absoluteSample);
		squareSum += sample * sample;
	}

	return {
		peak,
		rms: Math.sqrt(squareSum / Math.max(1, channelData.length)),
	};
}

function isChannelActive(channel) {
	return (
		channel.peak >= ONE_SIDED_ACTIVE_PEAK_THRESHOLD ||
		channel.rms >= ONE_SIDED_ACTIVE_RMS_THRESHOLD
	);
}

function isChannelSilentComparedTo(candidate, reference) {
	return (
		candidate.peak <=
			Math.max(
				ONE_SIDED_ACTIVE_PEAK_THRESHOLD,
				reference.peak * ONE_SIDED_RELATIVE_SILENCE_RATIO,
			) &&
		candidate.rms <=
			Math.max(
				ONE_SIDED_ACTIVE_RMS_THRESHOLD,
				reference.rms * ONE_SIDED_RELATIVE_SILENCE_RATIO,
			)
	);
}

function createAudioBuffer({ length, numberOfChannels, sampleRate }) {
	if (typeof AudioBuffer !== "undefined") {
		return new AudioBuffer({
			length,
			numberOfChannels,
			sampleRate,
		});
	}

	return new OfflineAudioContext(
		numberOfChannels,
		length,
		sampleRate,
	).createBuffer(numberOfChannels, length, sampleRate);
}

function averageChannels(audioBuffer) {
	const mono = new Float32Array(audioBuffer.length);
	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const data = audioBuffer.getChannelData(channel);
		for (let index = 0; index < data.length; index += 1) {
			mono[index] += data[index] / audioBuffer.numberOfChannels;
		}
	}
	return mono;
}

function dbToLinear(db) {
	return 10 ** (db / 20);
}

function linearToDb(value) {
	return 20 * Math.log10(value);
}

function createChannelCompensatedAudioBuffer({
	channelTransform,
	inputBuffer,
	outputBuffer,
}) {
	const stats = deriveChannelCompensationStats({
		channelTransform,
		inputBuffer,
		outputBuffer,
	});

	return {
		audioBuffer: applyGainToAudioBuffer(outputBuffer, stats.gain),
		stats,
	};
}

function deriveChannelCompensationStats({
	channelTransform,
	inputBuffer,
	outputBuffer,
}) {
	const sourceChannel = sourceChannelForChannelMode(
		channelTransform.resolvedMode,
		inputBuffer,
	);
	const inputAnalysis =
		channelTransform.analysis ?? analyzeChannelActivity(inputBuffer);
	const activeInputChannelCount = inputAnalysis.channels.filter((channel) =>
		isChannelActive(channel),
	).length;
	const effectiveOutputChannelCount = effectivePlaybackChannelCountForBuffer({
		channelMode: channelTransform.resolvedMode,
		outputBuffer,
	});
	const shouldCompensate =
		sourceChannel !== null &&
		inputAnalysis.oneSidedStereo !== null &&
		activeInputChannelCount === 1 &&
		effectiveOutputChannelCount > activeInputChannelCount;
	const gain = shouldCompensate
		? Math.sqrt(activeInputChannelCount / effectiveOutputChannelCount)
		: 1;

	return {
		activeInputChannelCount,
		effectiveOutputChannelCount,
		gain,
		gainDb: linearToDb(gain),
		reason: shouldCompensate
			? "one-sided-source-to-centered-output"
			: "no-channel-compensation",
		sourceChannel,
	};
}

function sourceChannelForChannelMode(channelMode, inputBuffer) {
	if (
		channelMode === "use-left-as-mono" ||
		channelMode === "duplicate-left-to-stereo"
	) {
		return 0;
	}

	if (
		channelMode === "use-right-as-mono" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		return Math.min(1, inputBuffer.numberOfChannels - 1);
	}

	return null;
}

function effectivePlaybackChannelCountForBuffer({ channelMode, outputBuffer }) {
	if (
		channelMode === "use-left-as-mono" ||
		channelMode === "use-right-as-mono" ||
		channelMode === "duplicate-left-to-stereo" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		return Math.max(2, outputBuffer.numberOfChannels);
	}

	return outputBuffer.numberOfChannels;
}

function applyGainToAudioBuffer(audioBuffer, gain) {
	if (gain === 1) {
		return audioBuffer;
	}

	const adjustedBuffer = createAudioBuffer({
		length: audioBuffer.length,
		numberOfChannels: audioBuffer.numberOfChannels,
		sampleRate: audioBuffer.sampleRate,
	});

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const sourceData = audioBuffer.getChannelData(channel);
		const outputData = adjustedBuffer.getChannelData(channel);
		for (let index = 0; index < sourceData.length; index += 1) {
			outputData[index] = sourceData[index] * gain;
		}
	}

	return adjustedBuffer;
}

function createPeakSafeAudioBuffer(audioBuffer) {
	const rawPeakBeforeSafety = measureAudioBufferPeak(audioBuffer);
	const peakSafetyTargetDb = getPeakSafetyTargetDb();
	const peakSafetyTarget = dbToLinear(peakSafetyTargetDb);
	const peakSafetyGain =
		rawPeakBeforeSafety > peakSafetyTarget
			? peakSafetyTarget / rawPeakBeforeSafety
			: 1;
	const outputPeakAfterSafetyGain = rawPeakBeforeSafety * peakSafetyGain;
	const stats = {
		outputPeakAfterSafetyGain,
		peakAfterSafetyGain: outputPeakAfterSafetyGain,
		peakBeforeClamp: rawPeakBeforeSafety,
		peakSafetyGain,
		peakSafetyTarget,
		peakSafetyTargetDb,
		rawPeakBeforeSafety,
	};

	if (peakSafetyGain === 1) {
		return {
			audioBuffer,
			stats,
		};
	}

	const peakSafeBuffer = createAudioBuffer({
		length: audioBuffer.length,
		numberOfChannels: audioBuffer.numberOfChannels,
		sampleRate: audioBuffer.sampleRate,
	});

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const sourceData = audioBuffer.getChannelData(channel);
		const outputData = peakSafeBuffer.getChannelData(channel);
		for (let index = 0; index < sourceData.length; index += 1) {
			outputData[index] = sourceData[index] * peakSafetyGain;
		}
	}

	return {
		audioBuffer: peakSafeBuffer,
		stats,
	};
}

function getPeakSafetyTargetDb() {
	const configuredTarget = Number(state.settings?.peakSafetyTargetDb);
	return Number.isFinite(configuredTarget)
		? configuredTarget
		: DEFAULT_PEAK_SAFETY_TARGET_DB;
}

function measureAudioBufferPeak(audioBuffer) {
	let peak = 0;

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const channelData = audioBuffer.getChannelData(channel);
		for (const sample of channelData) {
			peak = Math.max(peak, Math.abs(sample));
		}
	}

	return peak;
}

function analyzeAudioBufferSamples(audioBuffer) {
	let max = Number.NEGATIVE_INFINITY;
	let min = Number.POSITIVE_INFINITY;
	let nonFiniteSampleCount = 0;
	let overFullScaleSampleCount = 0;
	let peak = 0;
	let squareSum = 0;
	let totalSampleCount = 0;

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const channelData = audioBuffer.getChannelData(channel);
		for (const sample of channelData) {
			totalSampleCount += 1;

			if (!Number.isFinite(sample)) {
				nonFiniteSampleCount += 1;
				continue;
			}

			const absoluteSample = Math.abs(sample);
			if (absoluteSample > 1) {
				overFullScaleSampleCount += 1;
			}

			max = Math.max(max, sample);
			min = Math.min(min, sample);
			peak = Math.max(peak, absoluteSample);
			squareSum += sample * sample;
		}
	}

	return {
		max,
		min,
		nonFiniteSampleCount,
		overFullScaleSampleCount,
		peak,
		rms: Math.sqrt(squareSum / Math.max(1, totalSampleCount)),
		totalSampleCount,
	};
}

async function audioBufferToM4aBlob(audioBuffer) {
	const format = new Mp4OutputFormat({ fastStart: "in-memory" });
	const target = new BufferTarget();
	const output = new Output({ format, target });
	const source = new AudioBufferSource({
		bitrate: TRANSFORMED_AAC_BITRATE,
		codec: "aac",
	});

	output.addAudioTrack(source);
	await output.start();
	await source.add(audioBuffer);
	source.close();
	await output.finalize();

	if (!target.buffer) {
		throw new Error("M4A output produced no buffer.");
	}

	return {
		blob: new Blob([target.buffer], { type: "audio/mp4" }),
		stats: {
			bitrate: TRANSFORMED_AAC_BITRATE,
			channelCount: audioBuffer.numberOfChannels,
			codec: "aac",
			durationSeconds: audioBuffer.duration,
			sampleRate: audioBuffer.sampleRate,
		},
	};
}

function audioBufferToWavBlob(audioBuffer, peakSafetyStats) {
	const bytesPerSample = 2;
	const channelCount = audioBuffer.numberOfChannels;
	const dataByteLength = audioBuffer.length * channelCount * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataByteLength);
	const view = new DataView(buffer);
	let offset = 0;

	writeAscii(view, offset, "RIFF");
	offset += 4;
	view.setUint32(offset, 36 + dataByteLength, true);
	offset += 4;
	writeAscii(view, offset, "WAVE");
	offset += 4;
	writeAscii(view, offset, "fmt ");
	offset += 4;
	view.setUint32(offset, 16, true);
	offset += 4;
	view.setUint16(offset, 1, true);
	offset += 2;
	view.setUint16(offset, channelCount, true);
	offset += 2;
	view.setUint32(offset, audioBuffer.sampleRate, true);
	offset += 4;
	view.setUint32(
		offset,
		audioBuffer.sampleRate * channelCount * bytesPerSample,
		true,
	);
	offset += 4;
	view.setUint16(offset, channelCount * bytesPerSample, true);
	offset += 2;
	view.setUint16(offset, 8 * bytesPerSample, true);
	offset += 2;
	writeAscii(view, offset, "data");
	offset += 4;
	view.setUint32(offset, dataByteLength, true);
	offset += 4;

	const channelData = Array.from({ length: channelCount }, (_, channel) =>
		audioBuffer.getChannelData(channel),
	);
	let clippedSampleCount = 0;
	let encodedPeakBeforeClamp = 0;

	for (let frame = 0; frame < audioBuffer.length; frame += 1) {
		for (let channel = 0; channel < channelCount; channel += 1) {
			const rawSample = channelData[channel][frame] ?? 0;
			encodedPeakBeforeClamp = Math.max(
				encodedPeakBeforeClamp,
				Math.abs(rawSample),
			);
			const sample = Math.max(-1, Math.min(1, rawSample));
			if (sample !== rawSample) {
				clippedSampleCount += 1;
			}
			view.setInt16(
				offset,
				sample < 0 ? sample * 0x8000 : sample * 0x7fff,
				true,
			);
			offset += bytesPerSample;
		}
	}

	return {
		blob: new Blob([buffer], { type: "audio/wav" }),
		stats: {
			...peakSafetyStats,
			bitDepth: 16,
			channelCount,
			clippedSampleCount,
			durationSeconds: audioBuffer.duration,
			encodedPeakBeforeClamp,
			sampleRate: audioBuffer.sampleRate,
		},
	};
}

function writeAscii(view, offset, text) {
	for (let index = 0; index < text.length; index += 1) {
		view.setUint8(offset + index, text.charCodeAt(index));
	}
}

function describeAudioBuffer(audioBuffer) {
	return {
		durationSeconds: audioBuffer.duration,
		length: audioBuffer.length,
		numberOfChannels: audioBuffer.numberOfChannels,
		sampleRate: audioBuffer.sampleRate,
	};
}

function render() {
	peakCeilingSelect.value = String(getPeakSafetyTargetDb());
	stateElement.textContent = JSON.stringify(
		summarizeStateForDisplay(state),
		null,
		2,
	);
	tracksElement.replaceChildren(
		...state.results
			.filter((result) => result.status === "ready")
			.map((result) => renderTrack(result)),
	);
	mixdownElement.replaceChildren(renderMixdownPanel());
}

function renderTrack(result) {
	const section = document.createElement("section");
	section.className = "track";

	const heading = document.createElement("h2");
	heading.textContent = `Track ${result.metadata.number}: ${result.metadata.name ?? result.metadata.codec ?? "audio"}`;
	section.append(heading);

	const detail = document.createElement("div");
	detail.textContent = `${result.strategy} - ${result.source.mimeType} - ${formatBytes(result.source.byteLength)} - startPosition ${result.metadata.suggestedMultitrackStartPositionSeconds.toFixed(3)}s`;
	section.append(detail);

	section.append(renderAudioSource(result.source, "prepared-track"));

	const transformControls = document.createElement("div");
	transformControls.className = "controls";

	const transformSelect = document.createElement("select");
	for (const mode of CHANNEL_TRANSFORM_MODES) {
		const option = document.createElement("option");
		option.value = mode.value;
		option.textContent = mode.label;
		transformSelect.append(option);
	}
	transformSelect.value = result.prototypeSettings.channelMode;
	transformSelect.addEventListener("change", () => {
		result.prototypeSettings.channelMode = transformSelect.value;
		render();
	});
	transformControls.append(labelControl("Channel transform", transformSelect));

	const transformButton = document.createElement("button");
	transformButton.textContent = "Create transformed sources";
	transformButton.addEventListener("click", () => {
		void createDerivedSourcesForTrack(
			result.metadata.number,
			result.prototypeSettings.channelMode,
		);
	});
	transformControls.append(transformButton);
	section.append(transformControls);

	for (const derived of result.derivedSources ?? []) {
		section.append(renderDerivedSource(derived));
	}

	return section;
}

function renderDerivedSource(derived) {
	const section = document.createElement("section");
	section.className = "derived-source";

	const heading = document.createElement("h3");
	heading.textContent = `${derived.strategy} - ${derived.channelMode} - ${derived.status}`;
	section.append(heading);

	if (derived.status === "ready") {
		const detail = document.createElement("div");
		const peakStats = derived.peakSafety ?? derived.wav;
		detail.textContent = `${derived.source.mimeType} - ${formatBytes(derived.source.byteLength)} - ${derived.output.numberOfChannels}ch @ ${derived.output.sampleRate}Hz - resolved ${derived.channelTransform?.resolvedMode ?? derived.channelMode} - channel gain ${(derived.channelCompensation?.gain ?? 1).toFixed(3)} - output peak ${(peakStats?.outputPeakAfterSafetyGain ?? peakStats?.peakAfterSafetyGain ?? 0).toFixed(3)} - peak gain ${(peakStats?.peakSafetyGain ?? 1).toFixed(3)}`;
		section.append(detail);
		section.append(renderAudioSource(derived.source, "derived-track"));
	}

	if (derived.status === "failed") {
		const error = document.createElement("pre");
		error.textContent = JSON.stringify(derived.error, null, 2);
		section.append(error);
	}

	return section;
}

function renderMixdownPanel() {
	const section = document.createElement("section");
	section.className = "mixdown";

	const heading = document.createElement("h2");
	heading.textContent = "Merge tracks into one source";
	section.append(heading);

	const readyResults = state.results.filter(
		(result) => result.status === "ready",
	);
	if (readyResults.length === 0) {
		const empty = document.createElement("p");
		empty.textContent = "Prepare audio sources first.";
		section.append(empty);
		return section;
	}

	const outputChannels = document.createElement("select");
	for (const optionDefinition of [
		{ label: "Stereo output", value: "2" },
		{ label: "Mono output", value: "1" },
	]) {
		const option = document.createElement("option");
		option.value = optionDefinition.value;
		option.textContent = optionDefinition.label;
		outputChannels.append(option);
	}
	outputChannels.value = String(state.mixdown.outputChannels);
	outputChannels.addEventListener("change", () => {
		state.mixdown.outputChannels = Number(outputChannels.value);
		state.mixdown.result = null;
		render();
	});

	const headerControls = document.createElement("div");
	headerControls.className = "controls";
	headerControls.append(labelControl("Output", outputChannels));
	section.append(headerControls);

	const list = document.createElement("div");
	list.className = "mixdown-list";
	for (const result of readyResults) {
		list.append(renderMixdownTrackRow(result));
	}
	section.append(list);

	const button = document.createElement("button");
	button.disabled = state.mixdown.status === "mixing";
	button.textContent =
		state.mixdown.status === "mixing" ? "Merging..." : "Merge selected tracks";
	button.addEventListener("click", () => {
		void createMergedSources();
	});
	section.append(button);

	if (state.mixdown.error) {
		const error = document.createElement("pre");
		error.textContent = JSON.stringify(state.mixdown.error, null, 2);
		section.append(error);
	}

	if (state.mixdown.result) {
		const result = state.mixdown.result;
		for (const outputResult of result.outputs ?? []) {
			section.append(renderMixdownOutput(outputResult));
		}
	}

	return section;
}

function renderMixdownOutput(result) {
	const output = document.createElement("section");
	output.className = "derived-source";
	const title = document.createElement("h3");
	title.textContent = `${result.strategy} - ${result.output.numberOfChannels}ch @ ${result.output.sampleRate}Hz - ${result.status}`;
	output.append(title);

	if (result.status === "ready") {
		const peakStats = result.peakSafety ?? result.wav;
		const detail = document.createElement("div");
		detail.textContent = `${result.source.mimeType} - ${formatBytes(result.source.byteLength)} - raw peak ${(peakStats?.rawPeakBeforeSafety ?? peakStats?.peakBeforeClamp ?? 0).toFixed(3)} - output peak ${(peakStats?.outputPeakAfterSafetyGain ?? peakStats?.peakAfterSafetyGain ?? 0).toFixed(3)} - peak gain ${(peakStats?.peakSafetyGain ?? 1).toFixed(3)} - clipped samples ${result.wav?.clippedSampleCount ?? "n/a"}`;
		output.append(detail);
		output.append(renderAudioSource(result.source, "mixdown"));
	}

	if (result.status === "failed") {
		const error = document.createElement("pre");
		error.textContent = JSON.stringify(result.error, null, 2);
		output.append(error);
	}

	return output;
}

function renderMixdownTrackRow(result) {
	const trackNumber = String(result.metadata.number);
	const settings = state.mixdown.tracks[trackNumber] ?? {
		channelMode: "preserve",
		include: true,
	};
	const channelModeValue = normalizeChannelMode(settings.channelMode);
	const row = document.createElement("div");
	row.className = "mixdown-row";

	const include = document.createElement("input");
	include.checked = settings.include;
	include.type = "checkbox";
	include.addEventListener("change", () => {
		state.mixdown.tracks[trackNumber] = {
			...settings,
			include: include.checked,
		};
		state.mixdown.result = null;
		render();
	});

	const channelMode = document.createElement("select");
	for (const mode of MERGE_CHANNEL_MODES) {
		const option = document.createElement("option");
		option.value = mode.value;
		option.textContent = mode.label;
		channelMode.append(option);
	}
	channelMode.value = channelModeValue;
	channelMode.addEventListener("change", () => {
		state.mixdown.tracks[trackNumber] = {
			...settings,
			channelMode: channelMode.value,
		};
		state.mixdown.result = null;
		render();
	});

	const title = document.createElement("span");
	title.textContent = `Track ${result.metadata.number}: ${result.metadata.name ?? result.metadata.codec ?? "audio"} (${result.metadata.numberOfChannels}ch @ ${result.metadata.sampleRate}Hz)`;

	row.append(labelControl("Include", include), title, channelMode);
	return row;
}

function renderAudioSource(source, playGroup) {
	const wrapper = document.createDocumentFragment();

	const audio = document.createElement("audio");
	audio.controls = true;
	audio.dataset.playGroup = playGroup;
	audio.src = source.url;
	wrapper.append(audio);

	const download = document.createElement("a");
	download.download = source.downloadName;
	download.href = source.url;
	download.textContent = `Download ${source.downloadName}`;
	wrapper.append(download);

	return wrapper;
}

function labelControl(label, control) {
	const wrapper = document.createElement("label");
	wrapper.className = "control";
	const text = document.createElement("span");
	text.textContent = label;
	wrapper.append(text, control);
	return wrapper;
}

function summarizeStateForDisplay(value) {
	return JSON.parse(
		JSON.stringify(value, (key, nestedValue) => {
			if (key === "url") {
				return "[object URL kept alive in prototype]";
			}
			if (key === "blob" && nestedValue instanceof Blob) {
				return `[Blob ${formatBytes(nestedValue.size)}]`;
			}
			return nestedValue;
		}),
	);
}

function formatBytes(value) {
	if (value < 1024) {
		return `${value} B`;
	}
	if (value < 1024 * 1024) {
		return `${(value / 1024).toFixed(1)} KiB`;
	}
	return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function formatError(error) {
	return error instanceof Error
		? {
				message: error.message,
				name: error.name,
				stack: error.stack,
			}
		: {
				message: String(error),
				name: typeof error,
			};
}

window.addEventListener("beforeunload", revokeLiveUrls);
render();
