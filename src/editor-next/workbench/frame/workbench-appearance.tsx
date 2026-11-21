import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/** Appearance is a browser preference, independent of the loaded file and edit. */
export function WorkbenchAppearance() {
	const { theme = "dark", resolvedTheme, setTheme } = useTheme();
	const Icon =
		theme === "system" ? Monitor : resolvedTheme === "light" ? Sun : Moon;
	return (
		<label className="workbench-appearance">
			<Icon aria-hidden="true" />
			<select
				aria-label="Appearance"
				value={theme}
				onChange={(event) => setTheme(event.target.value)}
			>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
				<option value="system">System</option>
			</select>
		</label>
	);
}
