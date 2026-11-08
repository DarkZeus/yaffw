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

export type PreviewAudioContextAvailability = "running" | "blocked" | "closed";

/** Observes the browser context and makes pending resume attempts cancellable.
 * Cancellation invalidates the result; it cannot cancel the browser's promise.
 */
export function createPreviewAudioContextLifecycle(
	context: PreviewAudioContextLifecycleSource,
	onAvailabilityChange: (state: PreviewAudioContextAvailability) => void,
) {
	let disposed = false;
	let pending: ((running: boolean) => void) | null = null;
	let observed = readAvailability();

	function readAvailability(): PreviewAudioContextAvailability {
		switch (context.state) {
			case "suspended":
			case "interrupted":
				return "blocked";
			case "closed":
				return "closed";
			default:
				return "running";
		}
	}

	function observeAvailability() {
		const availability = readAvailability();
		if (!disposed && availability !== observed) {
			observed = availability;
			if (availability !== "blocked") pending?.(availability === "running");
			onAvailabilityChange(availability);
		}
		return availability;
	}

	context.addEventListener?.("statechange", observeAvailability);
	function cancelResume() {
		pending?.(false);
	}
	return {
		isRunning: () => readAvailability() === "running",
		cancelResume,
		resume() {
			cancelResume();
			if (disposed || observeAvailability() === "closed")
				return Promise.resolve(false);
			if (context.state === "running") return Promise.resolve(true);
			return new Promise<boolean>((resolve) => {
				let settled = false;
				const finish = (running: boolean) => {
					if (settled) return;
					settled = true;
					if (pending === finish) pending = null;
					resolve(running);
				};
				pending = finish;
				const observeCompletion = (fulfilled: boolean) =>
					finish(
						!disposed &&
							observeAvailability() === "running" &&
							(fulfilled || context.state === "running"),
					);
				try {
					// Invoke synchronously so an explicit Play retains user activation.
					Promise.resolve(context.resume?.()).then(
						() => observeCompletion(true),
						() => observeCompletion(false),
					);
				} catch {
					observeCompletion(false);
				}
			});
		},
		destroy() {
			if (disposed) return;
			disposed = true;
			cancelResume();
			context.removeEventListener?.("statechange", observeAvailability);
		},
	};
}
