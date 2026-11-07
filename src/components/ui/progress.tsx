import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type * as React from "react";

function Progress({
	className,
	value,
	...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
	return (
		<ProgressPrimitive.Root
			data-slot="progress"
			className={className}
			value={value}
			{...props}
		>
			<ProgressPrimitive.Track
				data-slot="progress-track"
				className="relative h-1.5 w-full overflow-hidden rounded-full bg-workbench-loading"
			>
				<ProgressPrimitive.Indicator
					data-slot="progress-indicator"
					className="h-full bg-workbench-progress transition-[width] data-indeterminate:w-0"
				/>
			</ProgressPrimitive.Track>
		</ProgressPrimitive.Root>
	);
}

export { Progress };
