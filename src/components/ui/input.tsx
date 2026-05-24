import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input flex h-8 w-full min-w-0 rounded-md border bg-background px-3 py-1 text-base shadow-xs transition-[background-color,border-color,color,box-shadow] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-workbench-disabled disabled:opacity-70 md:text-sm",
				"focus-visible:border-workbench-focus focus-visible:ring-workbench-focus/35 focus-visible:ring-[3px]",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/25",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
