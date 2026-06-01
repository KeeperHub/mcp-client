/**
 * KeeperHub MCP HTTP transport client.
 *
 * Maintains a single MCP session per client instance. Lazily opens the session
 * on the first tool call. Re-initializes on 401 or 404 with a session-related body.
 */

import { classifyApiKey, validateApiKeyForMcp, type ApiKeyKind } from "./keys";

export const DEFAULT_MCP_URL = "https://app.keeperhub.com/mcp";
export const MCP_PROTOCOL_VERSION = "2024-11-05";

export interface KeeperHubOrgContext {
	orgId: string | null;
	workflowCount: number;
}

export interface CallToolResult {
	content?: Array<{ type: string; text: string }>;
	isError?: boolean;
}

export interface ClientLogger {
	debug?(...args: unknown[]): void;
	info?(...args: unknown[]): void;
	warn?(...args: unknown[]): void;
	error?(...args: unknown[]): void;
}

export interface KeeperHubMcpClientOptions {
	apiKey: string;
	baseUrl?: string;
	clientInfo?: { name: string; version: string };
	logger?: ClientLogger;
	/** Inject for tests; defaults to global `fetch`. */
	fetchFn?: typeof fetch;
}

export class KeeperHubMcpClient {
	readonly apiKey: string;
	readonly apiKeyKind: ApiKeyKind;

	private readonly baseUrl: string;
	private readonly clientInfo: { name: string; version: string };
	private readonly logger: ClientLogger;
	private readonly fetchFn: typeof fetch;

	private sessionId: string | null = null;
	private requestId = 0;
	orgContext: KeeperHubOrgContext = { orgId: null, workflowCount: 0 };

	constructor(options: KeeperHubMcpClientOptions) {
		const apiKey = options.apiKey?.trim();
		if (!apiKey) {
			throw new Error("KeeperHubMcpClient requires a non-empty apiKey");
		}
		validateApiKeyForMcp(apiKey);
		this.apiKey = apiKey;
		this.apiKeyKind = classifyApiKey(apiKey);
		this.baseUrl = options.baseUrl ?? DEFAULT_MCP_URL;
		this.clientInfo = options.clientInfo ?? {
			name: "@keeperhub/mcp-client",
			version: "0.1.0",
		};
		this.logger = options.logger ?? console;
		this.fetchFn = options.fetchFn ?? fetch;
	}

	async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
		await this.ensureSession();
		const result = (await this.postMcp({
			jsonrpc: "2.0",
			id: ++this.requestId,
			method: "tools/call",
			params: { name, arguments: args },
		})) as CallToolResult | undefined;

		if (result?.isError) {
			const msg = result.content?.[0]?.text ?? "Unknown KeeperHub error";
			throw new Error(`KeeperHub tool error (${name}): ${msg}`);
		}

		const text = result?.content?.[0]?.text;
		if (typeof text === "string") {
			try {
				return JSON.parse(text) as unknown;
			} catch {
				return text;
			}
		}

		return result;
	}

	async refreshOrgContext(): Promise<KeeperHubOrgContext> {
		try {
			const workflows = await this.callTool("list_workflows", {});
			const list = Array.isArray(workflows)
				? (workflows as Array<Record<string, unknown>>)
				: [];
			const orgId =
				list.length > 0
					? ((list[0]?.organizationId as string | undefined) ?? null)
					: null;
			this.orgContext = { orgId, workflowCount: list.length };
		} catch {
			// Non-fatal
		}
		return this.orgContext;
	}

	resetSession(): void {
		this.sessionId = null;
	}

	private async ensureSession(): Promise<void> {
		if (this.sessionId) return;

		const body = {
			jsonrpc: "2.0",
			id: ++this.requestId,
			method: "initialize",
			params: {
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: this.clientInfo,
			},
		};

		const res = await this.fetchFn(this.baseUrl, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`KeeperHub initialize failed (${res.status}): ${text}`);
		}

		const sid = res.headers.get("mcp-session-id");
		if (!sid) throw new Error("KeeperHub did not return mcp-session-id");
		this.sessionId = sid;
		this.logger.info?.("[KeeperHub] MCP session established");
	}

	private async postMcp(body: object): Promise<unknown> {
		if (!this.sessionId) throw new Error("No active MCP session");

		const res = await this.fetchFn(this.baseUrl, {
			method: "POST",
			headers: { ...this.headers(), "mcp-session-id": this.sessionId },
			body: JSON.stringify(body),
		});

		if (res.status === 401) {
			this.logger.warn?.("[KeeperHub] Session unauthorized, re-initializing");
			this.sessionId = null;
			await this.ensureSession();
			return this.postMcp(body);
		}

		if (res.status === 404) {
			const text = await res.text().catch(() => "");
			if (text.toLowerCase().includes("session")) {
				this.logger.warn?.("[KeeperHub] Session expired, re-initializing");
				this.sessionId = null;
				await this.ensureSession();
				return this.postMcp(body);
			}
			throw new Error(`KeeperHub MCP error (404): ${text}`);
		}

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`KeeperHub MCP error (${res.status}): ${text}`);
		}

		const json = (await res.json()) as {
			result?: unknown;
			error?: { message: string };
		};
		if (json.error) throw new Error(`KeeperHub RPC error: ${json.error.message}`);
		return json.result;
	}

	private headers(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${this.apiKey}`,
		};
	}
}

/** @deprecated Alias for {@link KeeperHubMcpClient}. */
export const KeeperHubClient = KeeperHubMcpClient;

export interface GetClientOptions {
	logger?: ClientLogger;
	clientInfo?: { name: string; version: string };
	baseUrl?: string;
	fetchFn?: typeof fetch;
}

let cachedClient: KeeperHubMcpClient | null = null;
let cachedKey: string | null = null;

export function getClient(
	apiKey: string,
	options: GetClientOptions = {},
): KeeperHubMcpClient {
	if (!cachedClient || cachedKey !== apiKey) {
		cachedClient = new KeeperHubMcpClient({
			apiKey,
			logger: options.logger,
			clientInfo: options.clientInfo,
			baseUrl: options.baseUrl,
			fetchFn: options.fetchFn,
		});
		cachedKey = apiKey;
	}
	return cachedClient;
}

export function __resetClientForTests(): void {
	cachedClient = null;
	cachedKey = null;
}
