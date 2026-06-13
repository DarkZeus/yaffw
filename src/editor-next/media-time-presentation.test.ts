import { describe, expect, it } from "vitest";

import { formatMediaTime } from "./media-time-presentation";

describe("media time presentation", () => {
	it("formats editor-next media time as HH:MM:SS.mmm", () => {
		expect(formatMediaTime(0)).toBe("00:00:00.000");
		expect(formatMediaTime(999)).toBe("00:00:00.000");
		expect(formatMediaTime(1_000)).toBe("00:00:00.001");
		expect(formatMediaTime(3_723_004_000)).toBe("01:02:03.004");
		expect(formatMediaTime(54_250_999)).toBe("00:00:54.250");
	});
});
