import { describe, expect, it } from "vitest";

import { createMediaSourceFailureBoundary } from "../scopes/media-source-failure-boundary";

describe("createMediaSourceFailureBoundary", () => {
	it("rejects pending work with the first idle source failure", async () => {
		const boundary = createMediaSourceFailureBoundary();
		const first = new Error("Blob became unreadable.");
		const work = boundary.run(new Promise<never>(() => undefined));

		boundary.handleUnhandledError(first);
		boundary.handleUnhandledError(new Error("Later failure."));

		await expect(work).rejects.toBe(first);
	});

	it("rejects work started after an idle source failure", async () => {
		const boundary = createMediaSourceFailureBoundary();
		const failure = new Error("Blob became unreadable.");

		boundary.handleUnhandledError(failure);

		await expect(
			boundary.run(new Promise<never>(() => undefined)),
		).rejects.toBe(failure);
	});
});
