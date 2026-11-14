import {
	BlobSource,
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	EncodedVideoPacketSource,
	Input,
	MP4,
	Mp4OutputFormat,
	Output,
} from "mediabunny";

const maxVideoBytes = 112 * 1024 * 1024;
let video;
let audio;
let fragments;
let verifyPackets;

self.addEventListener("message", ({ data }) => {
	void run(data).then(
		({ result, transfer = [] }) => self.postMessage({ result }, transfer),
		(error) => self.postMessage({ error: String(error) }),
	);
});

async function run({ type, file, index, verify }) {
	if (type === "open") {
		verifyPackets = verify;
		return { result: await open(file) };
	}

	const fragment = fragments[index];
	const end = fragments[index + 1]?.start ?? Infinity;
	const [videoPart, audioPart] = await Promise.all([
		mux(video, fragment.start, end, index === 0),
		audio && mux(audio, fragment.start, end, index === 0),
	]);
	return {
		result: { video: videoPart, audio: audioPart },
		transfer: [videoPart.buffer, ...(audioPart ? [audioPart.buffer] : [])],
	};
}

async function open(file) {
	const input = new Input({
		formats: [MP4],
		source: new BlobSource(file, { maxCacheSize: 8 * 1024 * 1024 }),
	});
	const [videoTrack, audioTrack, duration] = await Promise.all([
		input.getPrimaryVideoTrack(),
		input.getPrimaryAudioTrack(),
		input.computeDuration(),
	]);
	if (
		(await videoTrack?.getCodec()) !== "avc" ||
		(audioTrack && (await audioTrack.getCodec()) !== "aac")
	) {
		throw new Error(
			"This prototype expects H.264 video and optional AAC audio in an MP4.",
		);
	}

	video = await describe(videoTrack, "video");
	audio = audioTrack && (await describe(audioTrack, "audio"));
	fragments = [];
	for await (const packet of video.sink.packets(undefined, undefined, {
		metadataOnly: true,
	})) {
		if (packet.type === "key")
			fragments.push({ start: packet.timestamp, bytes: 0 });
		const fragment = fragments.at(-1);
		if (!fragment) throw new Error("The video must start with a keyframe.");
		fragment.bytes += packet.byteLength;
		if (fragment.bytes > maxVideoBytes) {
			throw new Error(
				"A keyframe interval exceeds the prototype's 112 MiB video payload budget.",
			);
		}
	}
	if (fragments.length === 0 || fragments[0].start !== 0) {
		throw new Error(
			"The prototype expects a video track starting at time zero.",
		);
	}

	return {
		audioMime: audio?.mime ?? null,
		videoMime: video.mime,
		fragments,
		duration,
		videoDuration: await videoTrack.computeDuration(),
	};
}

async function describe(track, kind) {
	return {
		kind,
		sink: new EncodedPacketSink(track),
		config: await track.getDecoderConfig(),
		mime: `${kind}/mp4; codecs="${await track.getCodecParameterString()}"`,
	};
}

async function mux({ sink, kind, config }, start, end, first) {
	const videoTrack = kind === "video";
	let packet = videoTrack
		? await sink.getKeyPacket(start, { verifyKeyPackets: true })
		: await sink.getPacket(start);
	if (!packet) packet = await sink.getFirstPacket();
	if (!videoTrack && !first && packet.timestamp < start) {
		packet = await sink.getNextPacket(packet);
	}
	if (!packet || packet.timestamp >= end) return null;

	let initBytes = 0;
	let mdatStart = 0;
	const target = new BufferTarget();
	const output = new Output({
		target,
		format: new Mp4OutputFormat({
			fastStart: "fragmented",
			minimumFragmentDuration: Infinity,
			onMoov: (data, position) => {
				initBytes = position + data.byteLength;
			},
			onMoof: (data, position) => {
				mdatStart = position + data.byteLength;
			},
		}),
	});
	const source = videoTrack
		? new EncodedVideoPacketSource("avc")
		: new EncodedAudioPacketSource("aac");
	if (videoTrack) output.addVideoTrack(source);
	else output.addAudioTrack(source);

	const nextKey =
		videoTrack && Number.isFinite(end)
			? await sink.getKeyPacket(end, { metadataOnly: true })
			: undefined;
	await output.start();
	let payloadBytes = 0;
	const packets = [];
	let packetCount = 0;
	for await (const encodedPacket of sink.packets(
		packet,
		nextKey ?? undefined,
	)) {
		if (!videoTrack && encodedPacket.timestamp >= end) break;
		await source.add(
			encodedPacket,
			packetCount === 0 ? { decoderConfig: config } : undefined,
		);
		payloadBytes += encodedPacket.byteLength;
		packetCount++;
		if (verifyPackets) packets.push(encodedPacket.data);
	}
	source.close();
	await output.finalize();

	// One track per fragment means the mdat payload is just these packets in
	// decode order. Check it in place while we still have their source bytes.
	const buffer = target.buffer;
	const box = new DataView(buffer, mdatStart);
	const mdatSize = box.getUint32(0);
	if (box.getUint32(4) !== 0x6d646174 || mdatSize !== payloadBytes + 8) {
		throw new Error("Unexpected fragment payload size.");
	}
	const mediaEnd = mdatStart + mdatSize;
	const bytes = new Uint8Array(buffer);
	let position = mdatStart + 8;
	for (const data of packets) {
		for (let index = 0; index < data.byteLength; index++) {
			if (bytes[position++] !== data[index]) {
				throw new Error("Fragment differs from the original encoded packets.");
			}
		}
	}
	return { buffer, initBytes, mediaEnd, packetCount };
}
