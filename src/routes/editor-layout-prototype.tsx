import { WorkbenchLayoutModelPrototype } from "@/editor-next/workbench-layout-model-prototype";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/editor-layout-prototype")({
	component: WorkbenchLayoutModelPrototype,
});
