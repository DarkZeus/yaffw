import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection } from "astro:content";

// Hand-written changelog: one Markdown file per notable change in
// src/content/changelog/. Files starting with "_" (drafts, the template) are skipped.
const changelog = defineCollection({
	loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/changelog" }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		version: z.string().optional(),
	}),
});

export const collections = { changelog };
