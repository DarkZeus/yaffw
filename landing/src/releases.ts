// Changelog source: published GitHub releases of the editor, read at build time.
// A new release shows up on the next landing build.

const API = "https://api.github.com/repos/DarkZeus/yaffw/releases?per_page=100";

export interface Release {
	tag_name: string;
	name: string | null;
	html_url: string;
	published_at: string;
	prerelease: boolean;
	draft: boolean;
	/** Release notes rendered by GitHub (requested via the html+json media type). */
	body_html?: string;
}

export async function loadReleases(): Promise<Release[]> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github.html+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "yaffw-landing-build",
	};
	// Optional: lifts the 60 requests/hour anonymous limit (CI passes its token).
	const token = process.env.GITHUB_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;

	try {
		const res = await fetch(API, { headers });
		if (!res.ok)
			throw new Error(
				`GitHub releases request failed: ${res.status} ${res.statusText}`,
			);
		const all = (await res.json()) as Release[];
		return all.filter((r) => !r.draft && r.published_at);
	} catch (err) {
		// Offline local dev still renders; a production build fails instead of shipping an empty changelog.
		if (import.meta.env.DEV) {
			console.warn(`[changelog] ${String(err)}`);
			return [];
		}
		throw err;
	}
}
