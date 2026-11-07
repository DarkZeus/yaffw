import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs transition-[background-color,border-color,color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-workbench-disabled disabled:opacity-70 md:text-sm",
				"focus-visible:border-workbench-focus focus-visible:ring-[3px] focus-visible:ring-workbench-focus/35",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/25",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
