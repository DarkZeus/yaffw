import type { MediaPlayerInstance } from "@vidstack/react";
import { describe, expect, it, vi } from "vitest";

import { createPreviewMediaTransport } from "../transport/preview-media-transport";

describe("createPreviewMediaTransport", () => {
	it("resumes native playback when a seek hid its pause from the player store", async () => {
		const { player, native, provider, transport } = createFixture();
		player.paused = false;
		native.paused = true;

		await transport.play();

		expect(native.paused).toBe(false);
		expect(provider.play).toHaveBeenCalledOnce();
		expect(player.play).not.toHaveBeenCalled();
	});

	it("stops native playback even when the player store already reports paused", async () => {
		const { player, native, provider, transport } = createFixture();
		player.paused = true;
		native.paused = false;

		await transport.pause();

		expect(native.paused).toBe(true);
		expect(provider.pause).toHaveBeenCalledOnce();
		expect(player.pause).not.toHaveBeenCalled();
	});
});

function createFixture() {
	const native = { paused: true };
	const provider = {
		play: vi.fn(async () => {
			native.paused = false;
		}),
		pause: vi.fn(async () => {
			native.paused = true;
		}),
	};
	const player = {
		provider: provider as typeof provider | null,
		currentTime: 0,
		playbackRate: 1,
		muted: false,
		volume: 1,
		paused: true,
		state: { seeking: false },
		play: vi.fn(async () => {
			if (player.paused) await player.provider?.play();
		}),
		pause: vi.fn(async () => {
			if (!player.paused) await player.provider?.pause();
		}),
	};
	const transport = createPreviewMediaTransport(
		player as unknown as MediaPlayerInstance,
	);
	return { player, native, provider, transport };
}
