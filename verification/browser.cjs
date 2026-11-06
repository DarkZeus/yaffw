async function launchBrowser(options = {}) {
	const { chromium } = require(
		process.env.YAFFW_PLAYWRIGHT_PATH || "playwright",
	);
	return chromium.launch({
		headless: true,
		executablePath: process.env.YAFFW_BROWSER_EXECUTABLE,
		...options,
	});
}

module.exports = { launchBrowser };
