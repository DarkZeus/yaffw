import peaks from "./media/peaks.json";
import type { Asset } from "./model";
import { SECOND } from "./model";
export const initialAssets: Asset[] = [
	{
		id: "zone",
		name: "Marsh wide.mp4",
		kind: "video",
		url: new URL("./media/zone.mp4", import.meta.url).href,
		poster: new URL("./media/frame-03.jpg", import.meta.url).href,
		duration: 13.5 * SECOND,
		hasAudio: true,
		peaks,
	},
	{
		id: "encounter",
		name: "Encounter.mp4",
		kind: "video",
		url: new URL("./media/encounter.mp4", import.meta.url).href,
		poster: new URL("./media/encounter.jpg", import.meta.url).href,
		duration: 7 * SECOND,
		hasAudio: true,
		peaks: peaks.slice(40, 180),
	},
	{
		id: "detail",
		name: "Creature detail.mp4",
		kind: "video",
		url: new URL("./media/detail.mp4", import.meta.url).href,
		poster: new URL("./media/detail.jpg", import.meta.url).href,
		duration: 5 * SECOND,
		hasAudio: true,
		peaks: peaks.slice(160, 260),
	},
	{
		id: "score",
		name: "Low tension.wav",
		kind: "audio",
		url: new URL("./media/tension.wav", import.meta.url).href,
		poster: "",
		duration: 30 * SECOND,
	},
	{
		id: "title",
		name: "Title",
		kind: "title",
		url: "",
		poster: "",
		duration: 120 * SECOND,
	},
];
