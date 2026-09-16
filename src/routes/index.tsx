import { createFileRoute } from "@tanstack/react-router";

import { EditorNextRoute } from "@/editor-next/route/entry/EditorNextRoute";

export const Route = createFileRoute("/")({
	component: EditorNextRoute,
});
