type Awaitable<T> = T | Promise<T>;

type DisposableMediaCleanup = () => Awaitable<void>;

export type DisposableMediaWorkScope = {
	dispose: () => Promise<void>;
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

export function createDisposableMediaWorkScope(): DisposableMediaWorkScope {
	const cleanups: DisposableMediaCleanup[] = [];
	let disposed = false;

	function registerCleanup(cleanup: DisposableMediaCleanup) {
		if (disposed) {
			throw new Error("Cannot register cleanup on a disposed media work scope.");
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

export async function withDisposableMediaWorkScope<T>(
	work: (scope: DisposableMediaWorkScope) => Awaitable<T>,
): Promise<T> {
	const scope = createDisposableMediaWorkScope();

	try {
		return await work(scope);
	} finally {
		await scope.dispose();
	}
}
