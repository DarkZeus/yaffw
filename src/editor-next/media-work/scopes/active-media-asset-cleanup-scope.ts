type ActiveMediaAssetCleanup = () => void;

export type ActiveMediaAssetCleanupRegistration = {
	dispose: () => void;
};

export type ActiveMediaAssetCleanupScope = {
	assetId: string;
	dispose: () => void;
	isCurrent: () => boolean;
	registerCleanup: (
		cleanup: ActiveMediaAssetCleanup,
	) => ActiveMediaAssetCleanupRegistration;
};

export type ActiveMediaAssetCleanupScopeController = {
	currentScope: () => ActiveMediaAssetCleanupScope | null;
	disposeCurrentScope: () => void;
	replaceCurrentScope: (assetId: string) => ActiveMediaAssetCleanupScope;
};

export function createActiveMediaAssetCleanupScopeController(): ActiveMediaAssetCleanupScopeController {
	let currentScope: ActiveMediaAssetCleanupScope | null = null;

	function clearCurrentScope(scope: ActiveMediaAssetCleanupScope) {
		if (currentScope === scope) {
			currentScope = null;
		}
	}

	return {
		currentScope: () => currentScope,
		disposeCurrentScope() {
			currentScope?.dispose();
		},
		replaceCurrentScope(assetId: string) {
			const previousScope = currentScope;
			const nextScope = createActiveMediaAssetCleanupScope({
				assetId,
				clearCurrentScope,
				isCurrent: (scope) => currentScope === scope,
			});

			currentScope = nextScope;
			previousScope?.dispose();

			return nextScope;
		},
	};
}

function createActiveMediaAssetCleanupScope({
	assetId,
	clearCurrentScope,
	isCurrent,
}: {
	assetId: string;
	clearCurrentScope: (scope: ActiveMediaAssetCleanupScope) => void;
	isCurrent: (scope: ActiveMediaAssetCleanupScope) => boolean;
}): ActiveMediaAssetCleanupScope {
	const registrations = new Set<ActiveMediaAssetCleanupRegistration>();
	let disposed = false;

	const scope: ActiveMediaAssetCleanupScope = {
		assetId,
		dispose() {
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

			clearCurrentScope(scope);

			if (cleanupErrors.length === 1) {
				throw cleanupErrors[0];
			}

			if (cleanupErrors.length > 1) {
				throw new AggregateError(
					cleanupErrors,
					"Multiple active Media asset cleanup callbacks failed.",
				);
			}
		},
		isCurrent() {
			return !disposed && isCurrent(scope);
		},
		registerCleanup(cleanup: ActiveMediaAssetCleanup) {
			const registration = createActiveMediaAssetCleanupRegistration(
				cleanup,
				registrations,
			);

			if (disposed) {
				registration.dispose();
				return registration;
			}

			registrations.add(registration);

			return registration;
		},
	};

	return scope;
}

function createActiveMediaAssetCleanupRegistration(
	cleanup: ActiveMediaAssetCleanup,
	registrations: Set<ActiveMediaAssetCleanupRegistration>,
): ActiveMediaAssetCleanupRegistration {
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
