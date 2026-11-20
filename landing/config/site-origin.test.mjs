import { describe, expect, it } from "vitest";
import {
	configuredProductionOrigin,
	productionOrigin,
} from "./site-origin.mjs";

describe("explicit landing production identity", () => {
	it("leaves unconfigured previews without a canonical origin", () => {
		expect(productionOrigin(undefined)).toBeUndefined();
		expect(productionOrigin("  ")).toBeUndefined();
	});
	it("normalizes an explicitly supplied HTTPS origin", () => {
		expect(productionOrigin(" https://Landing.Example.org:443/ ")).toBe(
			"https://landing.example.org",
		);
	});
	it.each([
		"not a URL",
		"http://landing.example.org",
		"https://landing.example.org/path",
		"https://landing.example.org/?preview=1",
		"https://landing.example.org/#content",
		"https://user:password@landing.example.org",
		"https://localhost",
		"https://preview.localhost",
		"https://127.0.0.1:4173",
		"https://127.1",
		"https://[::1]",
		"https://[::ffff:127.0.0.1]",
		"https://[::ffff:127.1.2.3]",
		"https://[::ffff:0.0.0.0]",
		"https://0.0.0.0",
	])("rejects an invalid or local identity: %s", (value) => {
		expect(() => productionOrigin(value)).toThrow(/LANDING_SITE_ORIGIN/);
	});
});

describe("deployment setting overrides", () => {
	it("lets an explicit empty override produce a non-indexable preview", () => {
		expect(configuredProductionOrigin("")).toBeUndefined();
	});
	it("uses the explicit override rather than the versioned production setting", () => {
		expect(
			configuredProductionOrigin("https://metadata.example.invalid/"),
		).toBe("https://metadata.example.invalid");
	});
	it("rejects an invalid override instead of falling back to production", () => {
		expect(() => configuredProductionOrigin("https://localhost")).toThrow(
			/LANDING_SITE_ORIGIN/,
		);
	});
});
