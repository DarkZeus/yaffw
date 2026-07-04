export type BrowserVideoTrack = {
	computePacketStats: (targetPacketCount?: number) => Promise<{
		averagePacketRate: number;
	}>;
	displayHeight: number;
	displayWidth: number;
};
