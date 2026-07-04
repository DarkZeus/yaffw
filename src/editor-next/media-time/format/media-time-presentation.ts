import type { MediaTimeUs } from "@/editor-core/model";

export function formatMediaTime(timeUs: MediaTimeUs): string {
	const totalMilliseconds = Math.floor(timeUs / 1_000);
	const milliseconds = totalMilliseconds % 1_000;
	const totalSeconds = Math.floor(totalMilliseconds / 1_000);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}.${String(
		milliseconds,
	).padStart(3, "0")}`;
}

function padTime(value: number): string {
	return String(value).padStart(2, "0");
}
