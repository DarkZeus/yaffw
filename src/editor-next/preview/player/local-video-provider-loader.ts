import {
	type MediaContext,
	type Src,
	VideoProviderLoader,
} from "@vidstack/react";

// Ready media assets have video. Native decoding decides which local containers
// and codecs can play; file MIME hints must not prevent provider selection.
export class LocalVideoProviderLoader extends VideoProviderLoader {
	canPlay({ src, type }: Src): boolean {
		return (
			typeof src === "string" &&
			src.startsWith("blob:") &&
			type === "video/object"
		);
	}

	async load(context: MediaContext) {
		const provider = await super.load(context);
		const loadSource = provider.loadSource.bind(provider);
		provider.loadSource = async (source, preload) => {
			// '?' makes the HTML provider assign src directly without a MIME
			// attribute. Keep YAFFW's existing object URL and disposal ownership.
			await loadSource({ ...source, type: "?" }, preload);
			const currentSrc = provider.currentSrc;
			if (
				currentSrc &&
				currentSrc.src === source.src &&
				currentSrc.type === "?" &&
				typeof source.src === "string"
			) {
				// Source selection compares both fields; retain its public identity.
				provider.currentSrc = { ...source, src: source.src };
			}
		};
		return provider;
	}
}

export const localVideoProviderLoaders = [LocalVideoProviderLoader];
