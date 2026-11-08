import { vi } from "vitest";

export function stubNativeMediaPlayback(
	play: () => Promise<void>,
	pause: () => void,
) {
	const paused = new WeakMap<HTMLMediaElement, boolean>();
	vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
		this: HTMLMediaElement,
	) {
		paused.set(this, false);
		return play();
	});
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
		this: HTMLMediaElement,
	) {
		paused.set(this, true);
		pause();
	});
	vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(
		function (this: HTMLMediaElement) {
			return paused.get(this) ?? true;
		},
	);
	return paused;
}
