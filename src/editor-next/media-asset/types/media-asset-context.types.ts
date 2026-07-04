import type { ReadyMediaAsset, Selection } from "@/editor-core/model";

export type MediaAssetContextPanelProps = {
	asset: ReadyMediaAsset;
	closeFileDisabled: boolean;
	onCloseFileRequested: () => void;
	selection: Selection;
};
