import type { MediaPlayerInstance } from "@vidstack/react";
import type { PreviewMediaTransportHandle } from "./use-native-preview-transport";

/** Keep commands on the provider: Vidstack's presentation state may omit a
 * native pause event during a seek, so its guarded player.play() can be stale.
 * The provider still emits normal media events for the viewer's controls.
 */
export function createPreviewMediaTransport(
	player: MediaPlayerInstance,
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
			return player.state.seeking;
		},
		async play() {
			const provider = player.provider;
			if (!provider) throw new Error("Preview video is not ready.");
			await provider.play();
		},
		pause() {
			return player.provider?.pause();
		},
	};
}
