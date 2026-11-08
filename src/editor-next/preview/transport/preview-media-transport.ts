import type { PreviewMediaTransportHandle } from "./use-native-preview-transport";

/** Commands use the native element returned by Video.js's Video ref. This
 * keeps the muted visual follower independent of presentation-store state.
 */
export function createPreviewMediaTransport(
	player: HTMLVideoElement,
): PreviewMediaTransportHandle {
	return {
		get currentTime() {
			return player.currentTime;
		},
		set currentTime(value) {
			player.currentTime = value;
		},
		get muted() {
			return player.muted;
		},
		set muted(value) {
			player.muted = value;
		},
		get playbackRate() {
			return player.playbackRate;
		},
		set playbackRate(value) {
			player.playbackRate = value;
		},
		get volume() {
			return player.volume;
		},
		set volume(value) {
			player.volume = value;
		},
		get seeking() {
			return player.seeking;
		},
		get ended() {
			return player.ended;
		},
		play() {
			return player.play();
		},
		pause() {
			player.pause();
		},
	};
}
