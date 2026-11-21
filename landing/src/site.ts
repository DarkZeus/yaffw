/** Public content pages; error pages and URL fragments are never sitemap entries. */
export const indexablePaths = ["/", "/changelog/"] as const;
export type CanonicalPath = (typeof indexablePaths)[number];
