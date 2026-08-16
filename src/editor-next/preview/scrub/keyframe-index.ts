import type { EncodedPacketSink } from "mediabunny";

const BUILD_YIELD_INTERVAL = 512;

export type KeyframeIndex = {
	floor: (timestampSeconds: number) => number | null;
};

export function createKeyframeIndex(
	packetSink: EncodedPacketSink,
): KeyframeIndex {
	const timestamps: number[] = [];
	let complete = false;

	void build();

	async function build() {
		try {
			let packet = await packetSink.getFirstKeyPacket({ metadataOnly: true });
			let walked = 0;
			while (packet) {
				timestamps.push(packet.timestamp);
				walked += 1;
				if (walked % BUILD_YIELD_INTERVAL === 0) {
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
				}
				packet = await packetSink.getNextKeyPacket(packet, {
					metadataOnly: true,
				});
			}
			complete = true;
		} catch {
			// Asset disposal can interrupt this optional performance index.
		}
	}

	return {
		floor(timestampSeconds) {
			if (
				timestamps.length === 0 ||
				timestampSeconds < timestamps[0] ||
				(!complete && timestampSeconds > timestamps[timestamps.length - 1])
			) {
				return null;
			}

			let low = 0;
			let high = timestamps.length - 1;
			while (low < high) {
				const middle = (low + high + 1) >> 1;
				if (timestamps[middle] <= timestampSeconds) {
					low = middle;
				} else {
					high = middle - 1;
				}
			}

			return timestamps[low];
		},
	};
}
