import type { ReadyMediaAsset, Selection } from "@/editor-core/model";

export type MediaAssetContextFact = {
	label: string;
	value: string;
};

export type MediaAssetContextViewModel = {
	audioFacts: MediaAssetContextFact[];
	closeFile: {
		disabled: boolean;
		label: "Close file";
	};
	identity: {
		assetId: string;
		name: string;
		summary: string;
	};
	provenanceFacts: MediaAssetContextFact[];
	selectionFacts: MediaAssetContextFact[];
	videoFacts: MediaAssetContextFact[];
};

export type MediaAssetContextOptions = {
	asset: ReadyMediaAsset;
	closeDisabled: boolean;
	selection: Selection;
};
