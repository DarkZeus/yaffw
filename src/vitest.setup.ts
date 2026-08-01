import type { MouseEvent, ReactNode } from "react";
import { beforeEach, vi } from "vitest";

type MockMediaPlayerProps = Record<string, unknown> & {
	children?: ReactNode;
	className?: string;
	crossOrigin?: boolean;
	src?: unknown;
};

vi.mock("@vidstack/react", async () => {
	const React = await import("react");
	const MediaPlayer = React.forwardRef<HTMLVideoElement, MockMediaPlayerProps>(
		function MockMediaPlayer(
			{
				children,
				className,
				crossOrigin,
				onProviderChange: _onProviderChange,
				src,
				title: _title,
				viewType: _viewType,
				...props
			},
			ref,
		) {
			return React.createElement(
				"div",
				{
					className,
					"data-testid": "mock-vidstack-player",
				},
				React.createElement("video", {
					...props,
					className: "h-full w-full bg-black object-contain",
					crossOrigin: crossOrigin ? "" : undefined,
					ref,
					src: normalizeMockPlayerSrc(src),
				}),
				children as ReactNode,
			);
		},
	);

	const passthrough = ({
		children,
		...props
	}: {
		children?: ReactNode;
		[key: string]: unknown;
	}) => React.createElement("div", props, children);

	return {
		MediaPlayer,
		MediaProvider: ({ children }: { children?: ReactNode }) =>
			React.createElement(React.Fragment, null, children),
		Menu: {
			Button: passthrough,
			Items: passthrough,
			Radio: ({
				children,
				onSelect,
				...props
			}: {
				children?: ReactNode;
				onSelect?: (event: Event) => void;
				[key: string]: unknown;
			}) =>
				React.createElement(
					"button",
					{
						...props,
						onClick: (event: MouseEvent<HTMLButtonElement>) =>
							onSelect?.(event.nativeEvent),
					},
					children,
				),
			RadioGroup: passthrough,
			Root: passthrough,
		},
		Poster: (props: Record<string, unknown>) =>
			React.createElement("img", props),
		Thumbnail: {
			Img: (props: Record<string, unknown>) =>
				React.createElement("img", props),
			Root: passthrough,
		},
		Track: () => null,
		isHLSProvider: () => false,
		useChapterOptions: () => Object.assign([], { selectedValue: undefined }),
		useMediaStore: () => ({ duration: 0 }),
		useVideoQualityOptions: () => [],
	};
});

vi.mock("@vidstack/react/player/layouts/default", async () => {
	const React = await import("react");
	const Chapters = (props: Record<string, unknown>) =>
		React.createElement("svg", props);

	return {
		DefaultTooltip: ({ children }: { children?: ReactNode }) =>
			React.createElement(React.Fragment, null, children),
		DefaultVideoLayout: () => null,
		defaultLayoutIcons: {
			Menu: {
				Chapters,
			},
		},
		useDefaultLayoutContext: () => ({ showMenuDelay: 0 }),
	};
});

beforeEach(() => {
	installTestStorage();
	installTestBrowserApis();
});

function normalizeMockPlayerSrc(src: unknown): string | undefined {
	if (typeof src === "string") {
		return src;
	}

	if (Array.isArray(src)) {
		return normalizeMockPlayerSrc(src[0]);
	}

	if (src && typeof src === "object" && "src" in src) {
		const nestedSrc = (src as { src?: unknown }).src;

		return typeof nestedSrc === "string" ? nestedSrc : undefined;
	}

	return undefined;
}

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
