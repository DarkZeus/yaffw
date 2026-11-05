import { StreamTarget } from "mediabunny";

export class FileBackedExportStorageError extends Error {
	constructor(
		readonly code: "unavailable" | "quota" | "io",
		operation: string,
		cause?: unknown,
	) {
		super(
			`File-backed export ${operation}: ${code === "quota" ? "OPFS storage quota was exceeded." : code === "unavailable" ? "OPFS is unavailable in this browser context." : "temporary storage failed."}`,
			{ cause },
		);
		this.name = "FileBackedExportStorageError";
	}
}

function storageError(operation: string, cause: unknown) {
	return new FileBackedExportStorageError(
		cause instanceof Error && cause.name === "QuotaExceededError"
			? "quota"
			: "io",
		operation,
		cause,
	);
}

/** AAC only: matches Mediabunny 1.65.2's minimum 1024-frame packet size and
 * Conversion's 1.5x + 64 margin, including encoder priming and final padding.
 * This is an estimate with headroom, not a guarantee for arbitrary encoders.
 */
export function mixedAacMaximumPacketCount(numberOfFrames: number): number {
	if (!Number.isSafeInteger(numberOfFrames) || numberOfFrames < 0) {
		throw new RangeError(
			"Mixed AAC frame count must be a non-negative safe integer.",
		);
	}
	const count = Math.ceil((1.5 * numberOfFrames) / 1024) + 64;
	if (count > 2 ** 32 - 1) {
		throw new RangeError("Mixed AAC packet reservation exceeds the MP4 limit.");
	}
	return count;
}

/** Proof-only seekable temporary output. Caller must await output cancellation /
 * finalization before disposal, and retain the staging file through delivery.
 */
export async function createFileBackedExportStaging() {
	if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
		throw new FileBackedExportStorageError("unavailable", "setup");
	}
	let root: FileSystemDirectoryHandle;
	try {
		root = await navigator.storage.getDirectory();
	} catch (cause) {
		throw new FileBackedExportStorageError("unavailable", "setup", cause);
	}
	const name = `yaffw-export-proof-${crypto.randomUUID()}.mp4`;
	let writable: FileSystemWritableFileStream;
	let handle: FileSystemFileHandle;
	try {
		handle = await root.getFileHandle(name, { create: true });
		writable = await handle.createWritable();
	} catch (cause) {
		try {
			await root.removeEntry(name);
		} catch (cleanupError) {
			if (
				!(
					cleanupError instanceof Error && cleanupError.name === "NotFoundError"
				)
			) {
				throw new AggregateError(
					[storageError("setup", cause), cleanupError],
					"Temporary export setup and cleanup failed.",
				);
			}
		}
		throw storageError("setup", cause);
	}
	let closed = false;
	let finalized = false;
	let disposed = false;
	let disposal: Promise<void> | undefined;
	let end = 0;
	const stats = {
		writes: 0,
		writtenBytes: 0,
		maxWriteBytes: 0,
		backpatchWrites: 0,
	};
	// Keep the OPFS stream unlocked: the target owns this bridge's writer, while
	// disposal can still abort the file stream after an errored target writer.
	const stream = new WritableStream({
		async write(chunk: {
			type: "write";
			position: number;
			data: Uint8Array<ArrayBuffer>;
		}) {
			if (disposed) throw new Error("Temporary export has been disposed.");
			stats.writes++;
			stats.writtenBytes += chunk.data.byteLength;
			stats.maxWriteBytes = Math.max(
				stats.maxWriteBytes,
				chunk.data.byteLength,
			);
			if (chunk.position < end) stats.backpatchWrites++;
			end = Math.max(end, chunk.position + chunk.data.byteLength);
			try {
				await writable.write(chunk);
			} catch (cause) {
				throw storageError("write", cause);
			}
		},
		async close() {
			try {
				await writable.close();
				closed = true;
			} catch (cause) {
				throw storageError("close", cause);
			}
		},
	});
	const target = new StreamTarget(stream, {
		chunked: true,
		chunkSize: 1024 * 1024,
	});
	target.on("finalized", () => {
		finalized = true;
	});
	return {
		target,
		name,
		stats,
		async finish(): Promise<File> {
			if (disposed || !finalized) {
				throw new Error(
					"Finalize the output before reading its temporary file.",
				);
			}
			try {
				return await handle.getFile();
			} catch (cause) {
				throw storageError("read", cause);
			}
		},
		dispose(): Promise<void> {
			disposal ??= (async () => {
				disposed = true;
				try {
					if (!closed) await writable.abort();
				} finally {
					await root.removeEntry(name);
				}
			})();
			return disposal;
		},
	};
}
