export type MediaSourceFailureBoundary = {
	/** Pass as a Mediabunny source's `handleUnhandledError` option. */
	handleUnhandledError: (error: unknown) => void;
	/**
	 * Settles with `work`, or rejects first with a source error that surfaced
	 * while no read was pending and therefore had no awaiting caller.
	 */
	run: <T>(work: Promise<T>) => Promise<T>;
};

export function createMediaSourceFailureBoundary(): MediaSourceFailureBoundary {
	let failed = false;
	let rejectFailure: (error: unknown) => void = () => undefined;
	const failure = new Promise<never>((_resolve, reject) => {
		rejectFailure = reject;
	});
	// Only `run` observes the failure; an unobserved boundary must stay quiet.
	failure.catch(() => undefined);

	return {
		handleUnhandledError(error) {
			if (failed) {
				return;
			}

			failed = true;
			rejectFailure(error);
		},
		run(work) {
			return Promise.race([work, failure]);
		},
	};
}
