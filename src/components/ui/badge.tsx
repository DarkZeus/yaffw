import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { VariantProps } from "class-variance-authority";

import { badgeVariants } from "@/components/ui/badge-variants";
import { cn } from "@/lib/utils";

function Badge({
	className,
	variant,
	render,
	ref,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		render,
		ref,
		state: { slot: "badge" },
		props: mergeProps<"span">(
			{ className: cn(badgeVariants({ variant }), className) },
			props,
		),
	});
}

export { Badge };
