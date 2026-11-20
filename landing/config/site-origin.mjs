import { BlockList, isIP } from "node:net";
import deployment from "./deployment.json" with { type: "json" };

const localAddresses = new BlockList();
localAddresses.addSubnet("127.0.0.0", 8, "ipv4");
localAddresses.addAddress("0.0.0.0", "ipv4");
localAddresses.addAddress("::1", "ipv6");
localAddresses.addAddress("::", "ipv6");

const configurationError = () =>
	new Error(
		"LANDING_SITE_ORIGIN must be the confirmed HTTPS production landing origin, without credentials, a path, query or fragment; local hosts are not production origins.",
	);

/** No request host, preview URL, or editor destination supplies a fallback. */
export function productionOrigin(input) {
	const value = input?.trim();
	if (!value) return undefined;
	let url;
	try {
		url = new URL(value);
	} catch {
		throw configurationError();
	}
	const hostname = url.hostname.replace(/\.$/, "");
	const address = hostname.replace(/^\[|\]$/g, "");
	const family = isIP(address);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash ||
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		(family && localAddresses.check(address, family === 4 ? "ipv4" : "ipv6"))
	)
		throw configurationError();
	return url.origin;
}

/** An explicit empty override selects a non-indexable preview build. */
export function configuredProductionOrigin(override) {
	return productionOrigin(
		override === undefined ? deployment.canonicalOrigin : override,
	);
}
