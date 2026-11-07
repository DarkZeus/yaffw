import { cva } from "class-variance-authority";

export const badgeVariants = cva(
	"inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] focus-visible:border-workbench-focus focus-visible:ring-[3px] focus-visible:ring-workbench-focus/35 aria-invalid:border-destructive aria-invalid:ring-destructive/25 [&>svg]:pointer-events-none [&>svg]:size-3",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground focus-visible:ring-destructive/30 [a&]:hover:bg-destructive/90",
				outline:
					"border-workbench-border-strong text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);
