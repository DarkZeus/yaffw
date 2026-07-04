import { VidstackPreviewPrototype } from "@/editor-next/prototypes/preview/vidstack-preview-prototype";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/vidstack-preview-prototype")({
	component: VidstackPreviewPrototype,
});
