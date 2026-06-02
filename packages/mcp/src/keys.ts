/**
 * KeeperHub API key resolution and classification.
 *
 * @see https://docs.keeperhub.com — API Keys
 *
 * - `kh_` — organization keys (`/api/keys`). REST API, MCP server, agent plugins.
 * - `wfb_` — user keys (`/api/api-keys`). Webhook triggers only; not valid for MCP.
 */

export const ENV_VAR_NAMES = ["KH_API_KEY", "KEEPERHUB_API_KEY"] as const;

export type SupportedEnvVar = (typeof ENV_VAR_NAMES)[number];

export const SUPPORTED_ENV_VARS: ReadonlyArray<string> = ENV_VAR_NAMES;

/** Known KeeperHub key prefixes (not interchangeable). */
export type ApiKeyKind = "org" | "webhook" | "unknown";

export interface ApiKeySources {
	/** e.g. OpenClaw `api.pluginConfig` */
	pluginConfig?: Record<string, unknown>;
	/** e.g. Eliza `runtime.getSetting(...)` values in precedence order */
	settings?: Array<string | null | undefined>;
	/** Host process environment */
	env?: Record<string, string | undefined>;
}

/** Shown when a `wfb_` key is used against MCP / REST. */
export const WFB_KEY_NOT_FOR_MCP_MESSAGE =
	"This key starts with wfb_ (user webhook key from /api/api-keys). MCP and the REST API require an organization key (kh_) from Settings → API Keys → Organisation (/api/keys). The two key types are not interchangeable.";

export const ORG_KEY_HINT =
	"Use an organization API key (prefix kh_) from Settings → API Keys → Organisation.";

function firstString(...values: Array<unknown>): string | null {
	for (const value of values) {
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.length > 0) return trimmed;
		}
	}
	return null;
}

/**
 * Resolve the active KeeperHub API key.
 *
 * Precedence:
 *   1. `pluginConfig.apiKey`
 *   2. each entry in `settings` (in order)
 *   3. `KH_API_KEY`, `KEEPERHUB_API_KEY` from `env`
 */
export function resolveApiKey(sources: ApiKeySources = {}): string | null {
	const fromConfig = firstString(sources.pluginConfig?.apiKey);
	if (fromConfig) return fromConfig;

	if (sources.settings) {
		for (const value of sources.settings) {
			const resolved = firstString(value);
			if (resolved) return resolved;
		}
	}

	const env = sources.env ?? (typeof process !== "undefined" ? process.env : {});
	for (const name of ENV_VAR_NAMES) {
		const value = firstString(env[name]);
		if (value) return value;
	}

	return null;
}

export function classifyApiKey(apiKey: string): ApiKeyKind {
	if (apiKey.startsWith("kh_")) return "org";
	if (apiKey.startsWith("wfb_")) return "webhook";
	return "unknown";
}

export function isOrgApiKey(apiKey: string): boolean {
	return classifyApiKey(apiKey) === "org";
}

/** @deprecated Use {@link isOrgApiKey}. */
export function isLikelyValidOrgApiKey(apiKey: string): boolean {
	return isOrgApiKey(apiKey);
}

/** @deprecated Use {@link isOrgApiKey}. */
export function isLikelyValidApiKey(apiKey: string): boolean {
	return isOrgApiKey(apiKey);
}

export function getApiKeyKindWarning(apiKey: string): string | null {
	const kind = classifyApiKey(apiKey);
	if (kind === "org") return null;
	if (kind === "webhook") return WFB_KEY_NOT_FOR_MCP_MESSAGE;
	return `Key does not start with kh_. ${ORG_KEY_HINT}`;
}

export function validateApiKeyForMcp(apiKey: string): void {
	const warning = getApiKeyKindWarning(apiKey);
	if (warning) {
		throw new Error(`KeeperHub API key: ${warning}`);
	}
}

export function maskApiKey(apiKey: string): string {
	if (apiKey.length <= 8) return "••••";
	return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
