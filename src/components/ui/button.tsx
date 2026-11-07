import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

function Button({
	className,
	variant,
	size,
	...props
}: React.ComponentProps<typeof ButtonPrimitive> &
	VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Button };
