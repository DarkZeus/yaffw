import { expect, it } from "vitest";
import { releaseDigest, validateRelease } from "./release.mjs";

it("requires the verified revision and workflow run for the exact artifact", () => {
	const bytes = Buffer.from("verified production assets");
	const manifest = {
		revision: "verified-sha",
		runId: "123",
		sha256: releaseDigest(bytes),
	};
	expect(() => validateRelease(manifest, bytes, manifest)).not.toThrow();
	expect(() =>
		validateRelease({ ...manifest, revision: "other-sha" }, bytes, manifest),
	).toThrow(/revision/);
	expect(() =>
		validateRelease({ ...manifest, runId: "other-run" }, bytes, manifest),
	).toThrow(/run/);
	expect(() =>
		validateRelease(
			manifest,
			Buffer.from("changed after verification"),
			manifest,
		),
	).toThrow(/checksum/);
});
