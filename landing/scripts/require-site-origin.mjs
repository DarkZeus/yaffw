import { configuredProductionOrigin } from "../config/site-origin.mjs";

if (!configuredProductionOrigin(process.env.LANDING_SITE_ORIGIN)) {
	throw new Error(
		"Production landing builds require a confirmed origin in config/deployment.json or LANDING_SITE_ORIGIN. An empty override selects preview mode and cannot be published through this command.",
	);
}
