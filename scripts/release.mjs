import { createHash } from "node:crypto";

export function releaseDigest(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

export function validateRelease(manifest, bytes, expected) {
	if (
		manifest.revision !== expected.revision ||
		manifest.runId !== expected.runId
	)
		throw new Error("Release does not belong to the verified revision/run");
	if (
		manifest.sha256 !== expected.sha256 ||
		releaseDigest(bytes) !== expected.sha256
	)
		throw new Error("Verified artifact checksum mismatch");
}
