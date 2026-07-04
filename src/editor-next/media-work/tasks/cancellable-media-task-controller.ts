export type CancellableMediaTask = {
	cancel: () => void;
	finish: () => void;
	isCurrent: () => boolean;
	signal: AbortSignal;
};

export type CancellableMediaTaskController = {
	cancelCurrentTask: () => void;
	startTask: () => CancellableMediaTask;
};

export function createCancellableMediaTaskController(): CancellableMediaTaskController {
	let currentTask: CancellableMediaTask | null = null;

	return {
		cancelCurrentTask() {
			currentTask?.cancel();
		},
		startTask() {
			currentTask?.cancel();

			const abortController = new AbortController();
			let finished = false;

			const task: CancellableMediaTask = {
				cancel() {
					if (finished) {
						return;
					}

					abortController.abort();
					task.finish();
				},
				finish() {
					if (finished) {
						return;
					}

					finished = true;
					if (currentTask === task) {
						currentTask = null;
					}
				},
				isCurrent() {
					return (
						!finished && currentTask === task && !abortController.signal.aborted
					);
				},
				signal: abortController.signal,
			};

			currentTask = task;

			return task;
		},
	};
}
