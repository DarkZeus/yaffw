import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

// Hosted Ubuntu already supplies the Chromium shared libraries and these UI
// font families. Prove it instead of downloading unrelated CJK font packages.
for (const family of ["Arial", "sans-serif", "serif", "monospace", "emoji"]) {
	const font = execFileSync("fc-match", [family], { encoding: "utf8" }).trim();
	if (!font) throw new Error(`Missing system font family: ${family}`);
	console.log(`BROWSER_FONT ${family}: ${font}`);
}
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	await page.setContent("<p>YAFFW → 123</p>");
	console.log(
		`BROWSER_RUNTIME ${JSON.stringify({ version: browser.version(), executable: chromium.executablePath() })}`,
	);
} finally {
	await browser.close();
}
