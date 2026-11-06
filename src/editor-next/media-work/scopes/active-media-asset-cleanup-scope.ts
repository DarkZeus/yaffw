import {
	type MediaCleanupRegistration,
	createSynchronousMediaWorkScope,
} from "./synchronous-media-work-scope";

type ActiveMediaAssetCleanup = () => void;

export type ActiveMediaAssetCleanupScope = {
	assetId: string;
	dispose: () => void;
	isCurrent: () => boolean;
	registerCleanup: (
		cleanup: ActiveMediaAssetCleanup,
	) => MediaCleanupRegistration;
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
	const lifetime = createSynchronousMediaWorkScope();
	const scope: ActiveMediaAssetCleanupScope = {
		assetId,
		dispose() {
			try {
				lifetime.dispose();
			} finally {
				clearCurrentScope(scope);
			}
		},
		isCurrent: () => !lifetime.isDisposed() && isCurrent(scope),
		registerCleanup: lifetime.registerCleanup,
	};
	return scope;
}
