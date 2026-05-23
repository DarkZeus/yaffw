import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
} from "mediabunny";

import type {
	ExportProgress,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";

export type DefaultExportRunnerRequest = {
	asset: ReadyMediaAsset;
	onProgress: (progress: ExportProgress) => void;
	selection: Selection;
	signal: AbortSignal;
	source: Blob;
};

export type DefaultExportRunnerResult = {
	blob: Blob;
	fileName?: string;
	mimeType?: string;
};

export type DefaultExportRunner = {
	cancelSupported: boolean;
	run: (
		request: DefaultExportRunnerRequest,
	) => Promise<DefaultExportRunnerResult>;
};

export class DefaultExportCancelledError extends Error {
	constructor() {
		super("Default export was cancelled.");
		this.name = "DefaultExportCancelledError";
	}
}

export const browserDefaultExportRunner: DefaultExportRunner = {
	cancelSupported: true,
	run: runBrowserDefaultExport,
};

export function isDefaultExportCancelledError(error: unknown): boolean {
	return (
		error instanceof DefaultExportCancelledError ||
		(error instanceof Error && error.name === "AbortError")
	);
}

async function runBrowserDefaultExport({
	onProgress,
	selection,
	signal,
	source,
}: DefaultExportRunnerRequest): Promise<DefaultExportRunnerResult> {
	if (signal.aborted) {
		throw new DefaultExportCancelledError();
	}

	onProgress({
		phase: "preparing",
	});

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	const target = new BufferTarget();
	const output = new Output({
		format: new Mp4OutputFormat(),
		target,
	});
	const conversion = await Conversion.init({
		audio: {
			codec: "aac",
		},
		input,
		output,
		showWarnings: false,
		trim: {
			end: selection.endUs / 1_000_000,
			start: selection.startUs / 1_000_000,
		},
		video: {
			codec: "avc",
		},
	});

	if (signal.aborted) {
		await conversion.cancel();
		throw new DefaultExportCancelledError();
	}

	conversion.onProgress = (completedRatio) => {
		onProgress({
			completedRatio: Math.max(0, Math.min(completedRatio, 1)),
			phase: completedRatio >= 1 ? "muxing" : "encoding",
		});
	};

	await raceWithAbort(conversion.execute(), signal, () => conversion.cancel());

	onProgress({
		completedRatio: 1,
		phase: "finalizing",
	});

	if (!target.buffer) {
		throw new Error("Default export failed before producing generated media.");
	}

	return {
		blob: new Blob([target.buffer], { type: "video/mp4" }),
		mimeType: "video/mp4",
	};
}

function raceWithAbort<T>(
	work: Promise<T>,
	signal: AbortSignal,
	cancel: () => Promise<unknown>,
): Promise<T> {
	if (signal.aborted) {
		void cancel();
		return Promise.reject(new DefaultExportCancelledError());
	}

	return new Promise<T>((resolve, reject) => {
		function handleAbort() {
			void cancel();
			reject(new DefaultExportCancelledError());
		}

		signal.addEventListener("abort", handleAbort, { once: true });

		work.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", handleAbort);
		});
	});
}
