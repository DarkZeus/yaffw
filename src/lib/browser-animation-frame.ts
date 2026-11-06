export function browserNowMs(): number {
	const clock =
		typeof window === "undefined" ? globalThis.performance : window.performance;
	return typeof clock?.now === "function" ? clock.now() : Date.now();
}

export function requestBrowserFrame(callback: FrameRequestCallback): number {
	if (typeof window.requestAnimationFrame === "function") {
		return window.requestAnimationFrame(callback);
	}
	return window.setTimeout(() => callback(browserNowMs()), 16);
}

export function cancelBrowserFrame(frameId: number) {
	if (typeof window.cancelAnimationFrame === "function") {
		window.cancelAnimationFrame(frameId);
		return;
	}
	window.clearTimeout(frameId);
}
