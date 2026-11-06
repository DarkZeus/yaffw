export type MediaCleanupRegistration = { dispose: () => void };

export function createSynchronousMediaWorkScope() {
	const registrations = new Set<MediaCleanupRegistration>();
	let disposed = false;

	function registerCleanup(cleanup: () => void): MediaCleanupRegistration {
		let released = false;
		const registration = {
			dispose() {
				if (released) return;
				released = true;
				registrations.delete(registration);
				cleanup();
			},
		};
		if (disposed) registration.dispose();
		else registrations.add(registration);
		return registration;
	}

	return {
		isDisposed: () => disposed,
		registerCleanup,
		dispose() {
			if (disposed) return;
			disposed = true;
			const activeRegistrations = Array.from(registrations).reverse();
			registrations.clear();
			const errors: unknown[] = [];
			for (const registration of activeRegistrations) {
				try {
					registration.dispose();
				} catch (error) {
					errors.push(error);
				}
			}
			if (errors.length === 1) throw errors[0];
			if (errors.length > 1)
				throw new AggregateError(
					errors,
					"Multiple media cleanup callbacks failed.",
				);
		},
	};
}
