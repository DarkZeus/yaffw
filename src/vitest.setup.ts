import { beforeEach, vi } from "vitest";

beforeEach(() => {
	installTestStorage();
	installTestBrowserApis();
});

function installTestStorage() {
	const localStorage = createTestStorage();

	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: localStorage,
	});

	if (typeof window !== "undefined") {
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: localStorage,
		});
	}
}

function createTestStorage(): Storage {
	const entries = new Map<string, string>();

	return {
		clear() {
			entries.clear();
		},
		getItem(key: string) {
			return entries.get(key) ?? null;
		},
		key(index: number) {
			return Array.from(entries.keys())[index] ?? null;
		},
		get length() {
			return entries.size;
		},
		removeItem(key: string) {
			entries.delete(key);
		},
		setItem(key: string, value: string) {
			entries.set(key, value);
		},
	};
}

function installTestBrowserApis() {
	if (typeof window === "undefined") {
		return;
	}

	// jsdom exposes audio/video track lists as plain arrays. Real browser lists
	// are EventTargets; Video.js subscribes to their add/remove/change events.
	for (const property of ["audioTracks", "videoTracks"]) {
		const tracks: unknown = Reflect.get(
			document.createElement("video"),
			property,
		);
		if (!Array.isArray(tracks)) continue;
		const lists = new WeakMap<HTMLMediaElement, EventTarget>();
		Object.defineProperty(HTMLMediaElement.prototype, property, {
			configurable: true,
			get(this: HTMLMediaElement) {
				let list = lists.get(this);
				if (!list) {
					list = Object.assign(new EventTarget(), {
						length: 0,
						[Symbol.iterator]: () => [][Symbol.iterator](),
					});
					lists.set(this, list);
				}
				return list;
			},
		});
	}

	const matchMedia = (query: string): MediaQueryList => ({
		addEventListener() {},
		addListener() {},
		dispatchEvent() {
			return false;
		},
		matches: false,
		media: query,
		onchange: null,
		removeEventListener() {},
		removeListener() {},
	});

	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: matchMedia,
	});
	Object.defineProperty(window, "scrollTo", {
		configurable: true,
		value: vi.fn(),
	});
	Object.defineProperty(globalThis, "IntersectionObserver", {
		configurable: true,
		value: TestIntersectionObserver,
	});
	Object.defineProperty(window, "IntersectionObserver", {
		configurable: true,
		value: TestIntersectionObserver,
	});
	Object.defineProperty(globalThis, "ResizeObserver", {
		configurable: true,
		value: TestResizeObserver,
	});
	Object.defineProperty(window, "ResizeObserver", {
		configurable: true,
		value: TestResizeObserver,
	});
}

class TestIntersectionObserver implements IntersectionObserver {
	readonly root: Element | Document | null = null;
	readonly rootMargin = "";
	readonly scrollMargin = "";
	readonly thresholds: ReadonlyArray<number> = [];

	disconnect() {}
	observe() {}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
	unobserve() {}
}

class TestResizeObserver implements ResizeObserver {
	disconnect() {}
	observe() {}
	unobserve() {}
}

installTestStorage();
installTestBrowserApis();
