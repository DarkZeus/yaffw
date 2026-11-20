const quoted = (files) => files.map((file) => JSON.stringify(file)).join(" ");

export default {
	"*.astro": [
		"pnpm --dir landing exec prettier --write",
		"pnpm --dir landing exec eslint --max-warnings 0",
	],
	"!(*.astro)": (files) => {
		const commands = [
			`pnpm exec oxfmt --write --no-error-on-unmatched-pattern ${quoted(files)}`,
		];
		const scripts = files.filter((file) => /\.[cm]?[jt]sx?$/.test(file));
		if (scripts.length)
			commands.push(`pnpm exec oxlint --deny-warnings ${quoted(scripts)}`);
		return commands;
	},
};
