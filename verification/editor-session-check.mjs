import assert from "node:assert/strict";
import { resolve } from "node:path";
import { launchBrowser } from "./browser.cjs";

const origin = process.env.YAFFW_EDITOR_ORIGIN || "http://127.0.0.1:3000";
const browser = await launchBrowser();
try {
	for (const capability of ["VideoDecoder", "VideoEncoder", "MediaSource"]) {
		const context = await browser.newContext();
		try {
			await context.addInitScript((name) => {
				Object.defineProperty(window, name, {
					configurable: true,
					value: undefined,
				});
			}, capability);
			const page = await context.newPage();
			const errors = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.goto(origin);
			await page.getByText("Unsupported runtime", { exact: true }).waitFor();
			assert.equal(await page.getByLabel("Local media file").count(), 0);
			assert.equal(await page.locator("video").count(), 0);
			assert.deepEqual(errors, []);
			console.log(
				`PASS missing ${capability} blocks import in the actual route`,
			);
		} finally {
			await context.close();
		}
	}
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
	});
	try {
		await context.addInitScript(() => {
			window.__liveObjectUrls = new Set();
			window.__mseObjectUrls = new Set();
			const create = URL.createObjectURL.bind(URL);
			const revoke = URL.revokeObjectURL.bind(URL);
			URL.createObjectURL = (source) => {
				const url = create(source);
				window.__liveObjectUrls.add(url);
				if (source instanceof MediaSource) window.__mseObjectUrls.add(url);
				return url;
			};
			URL.revokeObjectURL = (url) => {
				window.__liveObjectUrls.delete(url);
				window.__mseObjectUrls.delete(url);
				revoke(url);
			};
		});
		const page = await context.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(origin);
		const input = page.getByLabel("Local media file", { exact: true });
		await input.setInputFiles({
			name: "unreadable.mp4",
			mimeType: "video/mp4",
			buffer: Buffer.from("This is not a media container."),
		});
		await page
			.getByRole("heading", { name: "Couldn’t open video", exact: true })
			.waitFor();
		assert.equal(await input.isEnabled(), true);
		assert.equal(await page.locator("video").count(), 0);
		await page.waitForFunction(() => window.__liveObjectUrls.size === 0);
		console.log(
			"PASS unreadable media reports failure, releases resources, and permits retry",
		);

		const media = resolve(
			"public/export-correctness-fixtures/tiny-video-only.mp4",
		);
		for (const attempt of ["recovery", "reopen same file"]) {
			const expectMse = attempt === "recovery";
			if (!expectMse)
				await page.evaluate(() => {
					MediaSource.isTypeSupported = () => false;
				});
			await input.setInputFiles(media);
			const controls = page.getByRole("region", {
				name: "Workbench transport region",
				exact: true,
			});
			await controls.getByRole("button", { name: "Play", exact: true }).click();
			await page.waitForFunction(
				() => document.querySelector("video")?.currentTime > 0.2,
			);
			assert.equal(
				await page
					.locator("video")
					.evaluate((video) => window.__mseObjectUrls.has(video.currentSrc)),
				expectMse,
				"The first run must exercise real MSE; the second must exercise direct-file fallback",
			);
			await controls
				.getByRole("button", { name: "Pause", exact: true })
				.click();
			await controls
				.getByRole("button", { name: "Step forward one frame", exact: true })
				.click();
			assert.ok(await page.locator("video").evaluate((video) => video.paused));
			assert.ok(await page.evaluate(() => window.__liveObjectUrls.size > 0));
			page.once("dialog", (dialog) => dialog.accept());
			await page
				.getByRole("button", { name: "Close file", exact: true })
				.click();
			await page
				.getByRole("heading", { name: "Open a video", exact: true })
				.waitFor();
			assert.equal(await input.isEnabled(), true);
			assert.equal(await page.locator("video").count(), 0);
			await page.waitForFunction(() => window.__liveObjectUrls.size === 0);
			console.log(
				`PASS video-only ${attempt}, playback, frame step, Close file, and object URL release`,
			);
		}
		assert.deepEqual(errors, []);
	} finally {
		await context.close();
	}
} finally {
	await browser.close();
}
