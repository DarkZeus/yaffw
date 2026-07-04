type PreviewAdapterCleanup = () => void;

export type PreviewAdapterCleanupRegistration = {
	dispose: () => void;
};

export type PreviewAdapterLifecycle = {
	dispose: () => void;
	isDisposed: () => boolean;
	registerAnimationFrame: (
		frameId: number,
		cancelFrame: (frameId: number) => void,
	) => PreviewAdapterCleanupRegistration;
	registerCleanup: (
		cleanup: PreviewAdapterCleanup,
	) => PreviewAdapterCleanupRegistration;
	registerContainerClear: (
		container: Element | null | undefined,
	) => PreviewAdapterCleanupRegistration;
	registerDestroyable: <T extends { destroy: () => void }>(resource: T) => T;
	registerUnsubscribe: (
		unsubscribe: PreviewAdapterCleanup | null | undefined,
	) => PreviewAdapterCleanupRegistration;
};

export function createPreviewAdapterLifecycle(): PreviewAdapterLifecycle {
	const registrations = new Set<PreviewAdapterCleanupRegistration>();
	let disposed = false;

	function registerCleanup(
		cleanup: PreviewAdapterCleanup,
	): PreviewAdapterCleanupRegistration {
		const registration = createPreviewAdapterCleanupRegistration(
			cleanup,
			registrations,
		);

		if (disposed) {
			registration.dispose();
			return registration;
		}

		registrations.add(registration);

		return registration;
	}

	function dispose() {
		if (disposed) {
			return;
		}

		disposed = true;
		const cleanupErrors: unknown[] = [];
		const activeRegistrations = Array.from(registrations).reverse();
		registrations.clear();

		for (const registration of activeRegistrations) {
			try {
				registration.dispose();
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
				"Multiple preview adapter cleanup callbacks failed.",
			);
		}
	}

	return {
		dispose,
		isDisposed: () => disposed,
		registerAnimationFrame(frameId, cancelFrame) {
			return registerCleanup(() => cancelFrame(frameId));
		},
		registerCleanup,
		registerContainerClear(container) {
			if (!container) {
				return registerCleanup(() => {});
			}

			container.replaceChildren();

			return registerCleanup(() => container.replaceChildren());
		},
		registerDestroyable<T extends { destroy: () => void }>(resource: T) {
			registerCleanup(() => resource.destroy());

			return resource;
		},
		registerUnsubscribe(unsubscribe) {
			return registerCleanup(() => unsubscribe?.());
		},
	};
}

function createPreviewAdapterCleanupRegistration(
	cleanup: PreviewAdapterCleanup,
	registrations: Set<PreviewAdapterCleanupRegistration>,
): PreviewAdapterCleanupRegistration {
	let disposed = false;

	const registration = {
		dispose() {
			if (disposed) {
				return;
			}

			disposed = true;
			registrations.delete(registration);
			cleanup();
		},
	};

	return registration;
}
