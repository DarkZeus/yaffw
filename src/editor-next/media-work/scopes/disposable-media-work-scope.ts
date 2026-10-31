import { createMediaSourceFailureBoundary } from "./media-source-failure-boundary";

type Awaitable<T> = T | Promise<T>;

export type DisposableMediaCleanup = () => Awaitable<void>;

export type DisposableMediaWorkScope = {
	dispose: () => Promise<void>;
	/** Pass as a Mediabunny source's `handleUnhandledError` option. */
	handleUnhandledSourceError: (error: unknown) => void;
	registerCancellable: <T extends { cancel: () => Awaitable<void> }>(
		resource: T,
	) => T;
	registerClosable: <T extends { close: () => Awaitable<void> }>(
		resource: T,
	) => T;
	registerCleanup: (cleanup: DisposableMediaCleanup) => void;
	registerDisposable: <T extends { dispose: () => Awaitable<void> }>(
		resource: T,
	) => T;
};

export function createDisposableMediaWorkScope(
	handleUnhandledSourceError: (error: unknown) => void,
): DisposableMediaWorkScope {
	const cleanups: DisposableMediaCleanup[] = [];
	let disposed = false;

	function registerCleanup(cleanup: DisposableMediaCleanup) {
		if (disposed) {
			throw new Error(
				"Cannot register cleanup on a disposed media work scope.",
			);
		}

		cleanups.push(cleanup);
	}

	async function dispose() {
		if (disposed) {
			return;
		}

		disposed = true;
		const cleanupErrors: unknown[] = [];

		while (cleanups.length > 0) {
			const cleanup = cleanups.pop();

			if (!cleanup) {
				continue;
			}

			try {
				await cleanup();
			} catch (error) {
				cleanupErrors.push(error);
			}
		}

		if (cleanupErrors.length === 1) {
			throw cleanupErrors[0];
		}

		if (cleanupErrors.length > 1) {
			throw new AggregateError(
				cleanupErrors,
				"Multiple media work cleanup callbacks failed.",
			);
		}
	}

	return {
		dispose,
		handleUnhandledSourceError,
		registerCancellable<T extends { cancel: () => Awaitable<void> }>(
			resource: T,
		) {
			registerCleanup(() => resource.cancel());

			return resource;
		},
		registerClosable<T extends { close: () => Awaitable<void> }>(resource: T) {
			registerCleanup(() => resource.close());

			return resource;
		},
		registerCleanup,
		registerDisposable<T extends { dispose: () => Awaitable<void> }>(
			resource: T,
		) {
			registerCleanup(() => resource.dispose());

			return resource;
		},
	};
}

export function createDisposableMediaCleanup(
	cleanup: DisposableMediaCleanup,
): DisposableMediaCleanup {
	let disposed = false;

	return async () => {
		if (disposed) {
			return;
		}

		disposed = true;
		await cleanup();
	};
}

export async function withDisposableMediaWorkScope<T>(
	work: (scope: DisposableMediaWorkScope) => Awaitable<T>,
): Promise<T> {
	const sourceFailure = createMediaSourceFailureBoundary();
	const scope = createDisposableMediaWorkScope(
		sourceFailure.handleUnhandledError,
	);

	try {
		const result = await sourceFailure.run((async () => work(scope))());
		await scope.dispose();

		return result;
	} catch (error) {
		try {
			await scope.dispose();
		} catch {
			// Preserve the original media work failure.
		}

		throw error;
	}
}
