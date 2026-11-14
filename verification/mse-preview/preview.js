import { createMsePreview } from "../../src/editor-next/preview/mse/create-mse-preview";

const video = document.querySelector("video");
const fileInput = document.querySelector("input");
const status = document.querySelector("#status");
let active;

fileInput.addEventListener("change", () => {
	active?.close();
	const [file] = fileInput.files;
	if (!file) return;

	const preview = createMsePreview({ file, verifyPackets: true });
	active = preview;
	window.msePreview = preview.stats;
	status.textContent = "Reading MP4 index…";
	video.src = preview.url;
	void preview
		.play(video, () => {
			status.textContent = `${preview.stats.fragmentCount} keyframe intervals · Original encoded video`;
		})
		.catch((error) => {
			if (active !== preview) return;
			preview.stats.error = error.message;
			status.textContent = error.message;
			preview.close();
		});
});
window.addEventListener("pagehide", () => {
	const preview = active;
	active = null;
	preview?.close();
});
