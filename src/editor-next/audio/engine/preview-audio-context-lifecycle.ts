export type PreviewAudioContextState =
	| "running"
	| "suspended"
	| "interrupted"
	| "closed";

export type PreviewAudioContextLifecycleSource = {
	readonly state?: PreviewAudioContextState;
	resume?: () => Promise<void> | void;
	addEventListener?: (type: "statechange", listener: () => void) => void;
	removeEventListener?: (type: "statechange", listener: () => void) => void;
};

/** Observes the browser context and makes pending resume attempts cancellable.
 * Cancellation invalidates the result; it cannot cancel the browser's promise.
 */
export function createPreviewAudioContextLifecycle(
	context: PreviewAudioContextLifecycleSource,
	onStateChange: (state: PreviewAudioContextState) => void,
) {
	let disposed = false;
	let cancelPending: (() => void) | null = null;
	let lastState = context.state;
	const stateChanged = () => {
		if (disposed || !context.state || context.state === lastState) return;
		lastState = context.state;
		onStateChange(context.state);
	};
	context.addEventListener?.("statechange", stateChanged);
	function cancelResume() {
		cancelPending?.();
		cancelPending = null;
	}
	return {
		getState: () => context.state,
		isRunning: () => context.state === undefined || context.state === "running",
		cancelResume,
		resume() {
			cancelResume();
			if (disposed || context.state === "closed") return Promise.resolve(false);
			if (context.state === "running") return Promise.resolve(true);
			return new Promise<boolean>((resolve) => {
				let settled = false;
				const finish = (running: boolean) => {
					if (settled) return;
					settled = true;
					if (cancelPending === cancel) cancelPending = null;
					resolve(running);
				};
				const cancel = () => finish(false);
				cancelPending = cancel;
				try {
					// Invoke synchronously so an explicit Play retains user activation.
					Promise.resolve(context.resume?.()).then(
						() =>
							finish(
								!disposed &&
									(context.state === undefined || context.state === "running"),
							),
						() => finish(false),
					);
				} catch {
					finish(false);
				}
			});
		},
		destroy() {
			if (disposed) return;
			disposed = true;
			cancelResume();
			context.removeEventListener?.("statechange", stateChanged);
		},
	};
}
