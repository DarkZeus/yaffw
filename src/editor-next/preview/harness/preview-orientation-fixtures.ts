export type PreviewOrientationFixture = {
	displayDimensions: {
		height: number;
		width: number;
	};
	id: string;
	publicPath: string;
	rotationDegrees: 0 | 90 | 180 | 270;
};

export const PREVIEW_ORIENTATION_FIXTURES = [
	{
		displayDimensions: { height: 160, width: 90 },
		id: "preview-rotation-0",
		publicPath: "/preview-orientation-fixtures/rotation-0.mp4",
		rotationDegrees: 0,
	},
	{
		displayDimensions: { height: 160, width: 90 },
		id: "preview-rotation-90",
		publicPath: "/preview-orientation-fixtures/rotation-90.mp4",
		rotationDegrees: 90,
	},
	{
		displayDimensions: { height: 160, width: 90 },
		id: "preview-rotation-180",
		publicPath: "/preview-orientation-fixtures/rotation-180.mp4",
		rotationDegrees: 180,
	},
	{
		displayDimensions: { height: 160, width: 90 },
		id: "preview-rotation-270",
		publicPath: "/preview-orientation-fixtures/rotation-270.mp4",
		rotationDegrees: 270,
	},
] as const satisfies readonly PreviewOrientationFixture[];
