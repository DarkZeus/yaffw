import { useEditor } from "./use-editor";
import { Workbench } from "./workbench";
export default function App() {
	return <Workbench editor={useEditor()} />;
}
