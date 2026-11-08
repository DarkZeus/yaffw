/* @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { createPreviewMediaTransport } from "../transport/preview-media-transport";

describe("createPreviewMediaTransport", () => {
	it("always sends play and pause to the native element, independently of presentation state", async () => {
		const video = document.createElement("video");
		const play = vi.spyOn(video, "play").mockResolvedValue();
		const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);
		const transport = createPreviewMediaTransport(video);
		await transport.play();
		await transport.pause();
		expect(play).toHaveBeenCalledOnce();
		expect(pause).toHaveBeenCalledOnce();
	});

	it("forwards transport properties to the same video element", () => {
		const video = document.createElement("video");
		const transport = createPreviewMediaTransport(video);
		transport.currentTime = 12;
		transport.playbackRate = 1.5;
		transport.volume = 0.25;
		transport.muted = true;
		expect(video.currentTime).toBe(12);
		expect(video.playbackRate).toBe(1.5);
		expect(video.volume).toBe(0.25);
		expect(video.muted).toBe(true);
		expect(transport.currentTime).toBe(12);
		expect(transport.playbackRate).toBe(1.5);
		expect(transport.volume).toBe(0.25);
		expect(transport.muted).toBe(true);
		expect(transport.seeking).toBe(video.seeking);
		expect(transport.ended).toBe(video.ended);
	});
});
