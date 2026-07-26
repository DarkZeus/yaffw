import { useMemo } from "react";

import { detectRuntimeSupport } from "@/editor-core/runtime-capabilities";

import { useSingleAssetEditingSession } from "../session/use-single-asset-editing-session";
import { EditorNextRouteComposition } from "./editor-next-route-composition";

export function EditorNextRoute() {
	const runtime = useMemo(() => detectRuntimeSupport(), []);
	const editingSession = useSingleAssetEditingSession({ runtime });

	return (
		<EditorNextRouteComposition
			editingSession={editingSession}
			runtime={runtime}
		/>
	);
}
