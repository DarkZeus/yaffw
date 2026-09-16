import {
	type RuntimeSupport,
	detectRuntimeSupport,
} from "@/editor-core/runtime-capabilities";

import { EditorNextRouteComposition } from "../entry/editor-next-route-composition";
import {
	type UseSingleAssetEditingSessionOptions,
	useSingleAssetEditingSession,
} from "../session/use-single-asset-editing-session";

type EditorNextRouteTestHarnessProps = Omit<
	UseSingleAssetEditingSessionOptions,
	"runtime"
> & {
	initialRuntime?: RuntimeSupport;
};

export function EditorNextRouteTestHarness({
	initialRuntime = detectRuntimeSupport(),
	...sessionOptions
}: EditorNextRouteTestHarnessProps) {
	const editingSession = useSingleAssetEditingSession({
		...sessionOptions,
		runtime: initialRuntime,
	});

	return (
		<EditorNextRouteComposition
			editingSession={editingSession}
			runtime={initialRuntime}
		/>
	);
}
