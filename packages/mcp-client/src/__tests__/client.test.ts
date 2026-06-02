import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	__resetClientForTests,
	getClient,
	KeeperHubMcpClient,
} from "../client";
import {
	classifyApiKey,
	getApiKeyKindWarning,
	maskApiKey,
	resolveApiKey,
	validateApiKeyForMcp,
} from "../keys";

type FetchInit = RequestInit & { headers?: Record<string, string> };

function jsonResponse(
	body: unknown,
	init: { status?: number; sessionId?: string } = {},
): Response {
	const headers = new Headers({ "content-type": "application/json" });
	if (init.sessionId) headers.set("mcp-session-id", init.sessionId);
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers,
	});
}

function textResponse(
	body: string,
	init: { status?: number; sessionId?: string } = {},
): Response {
	const headers = new Headers({ "content-type": "text/plain" });
	if (init.sessionId) headers.set("mcp-session-id", init.sessionId);
	return new Response(body, {
		status: init.status ?? 200,
		headers,
	});
}

function captureFetch(responses: Array<() => Response>) {
	const calls: Array<{ url: string; init: FetchInit; body: unknown }> = [];
	let i = 0;
	const fn = (async (url: RequestInfo | URL, init?: RequestInit) => {
		const next = responses[i++];
		if (!next) {
			throw new Error(`Unexpected fetch call #${i} to ${String(url)}`);
		}
		let parsedBody: unknown;
		if (init?.body && typeof init.body === "string") {
			try {
				parsedBody = JSON.parse(init.body);
			} catch {
				parsedBody = init.body;
			}
		}
		calls.push({ url: String(url), init: (init ?? {}) as FetchInit, body: parsedBody });
		return next();
	}) as typeof fetch;
	return { fn, calls };
}

describe("keys", () => {
	it("classifies kh_ and wfb_ prefixes", () => {
		expect(classifyApiKey("kh_abc")).toBe("org");
		expect(classifyApiKey("wfb_abc")).toBe("webhook");
		expect(classifyApiKey("other")).toBe("unknown");
	});

	it("rejects wfb_ keys for MCP", () => {
		expect(getApiKeyKindWarning("wfb_test")).toContain("wfb_");
		expect(() => validateApiKeyForMcp("wfb_test")).toThrow(/not interchangeable/);
	});

	it("resolves pluginConfig before env", () => {
		expect(
			resolveApiKey({
				pluginConfig: { apiKey: "kh_from_config" },
				env: { KH_API_KEY: "kh_from_env" },
			}),
		).toBe("kh_from_config");
	});

	it("masks api keys for display", () => {
		expect(maskApiKey("kh_supersecret_value_123")).toBe("kh_s…_123");
	});
});

describe("KeeperHubMcpClient", () => {
	const silentLogger = {
		warn: () => undefined,
		info: () => undefined,
		error: () => undefined,
		debug: () => undefined,
	};

	beforeEach(() => __resetClientForTests());
	afterEach(() => __resetClientForTests());

	it("opens a session via initialize and uses the session id on tools/call", async () => {
		const { fn, calls } = captureFetch([
			() =>
				jsonResponse({ result: { protocolVersion: "2024-11-05" } }, { sessionId: "sess-1" }),
			() =>
				jsonResponse({
					result: {
						content: [{ type: "text", text: JSON.stringify([{ id: "wf-1", name: "Demo" }]) }],
					},
				}),
		]);

		const client = new KeeperHubMcpClient({
			apiKey: "kh_test",
			logger: silentLogger,
			fetchFn: fn,
		});
		const result = await client.callTool("list_workflows", {});

		expect(result).toEqual([{ id: "wf-1", name: "Demo" }]);
		expect(calls).toHaveLength(2);
		expect((calls[0]!.body as { method: string }).method).toBe("initialize");
		expect((calls[1]!.body as { method: string }).method).toBe("tools/call");
	});

	it("re-initializes on 401", async () => {
		const { fn, calls } = captureFetch([
			() => jsonResponse({ result: {} }, { sessionId: "sess-old" }),
			() => jsonResponse({ error: "unauthorized" }, { status: 401 }),
			() => jsonResponse({ result: {} }, { sessionId: "sess-new" }),
			() =>
				jsonResponse({
					result: { content: [{ type: "text", text: '"ok"' }] },
				}),
		]);

		const client = new KeeperHubMcpClient({
			apiKey: "kh_test",
			logger: silentLogger,
			fetchFn: fn,
		});
		expect(await client.callTool("list_workflows", {})).toBe("ok");
		expect(calls).toHaveLength(4);
	});

	it("re-initializes on 404 when the body mentions session", async () => {
		const { fn } = captureFetch([
			() => jsonResponse({ result: {} }, { sessionId: "sess-old" }),
			() => textResponse("session expired", { status: 404 }),
			() => jsonResponse({ result: {} }, { sessionId: "sess-new" }),
			() =>
				jsonResponse({
					result: { content: [{ type: "text", text: '{"status":"queued"}' }] },
				}),
		]);

		const client = new KeeperHubMcpClient({
			apiKey: "kh_test",
			logger: silentLogger,
			fetchFn: fn,
		});
		expect(await client.callTool("execute_workflow", { workflowId: "wf-1" })).toEqual({
			status: "queued",
		});
	});

	it("does not re-initialize on unrelated 404", async () => {
		const { fn } = captureFetch([
			() => jsonResponse({ result: {} }, { sessionId: "sess-old" }),
			() => textResponse("workflow not found", { status: 404 }),
		]);

		const client = new KeeperHubMcpClient({
			apiKey: "kh_test",
			logger: silentLogger,
			fetchFn: fn,
		});
		await expect(
			client.callTool("get_workflow", { workflowId: "missing" }),
		).rejects.toThrow(/404/);
	});

	it("re-initializes at most once on a persistent 401, then throws", async () => {
		const { fn, calls } = captureFetch([
			() => jsonResponse({ result: {} }, { sessionId: "sess-old" }),
			() => jsonResponse({ error: "unauthorized" }, { status: 401 }),
			() => jsonResponse({ result: {} }, { sessionId: "sess-new" }),
			() => jsonResponse({ error: "unauthorized" }, { status: 401 }),
		]);

		const client = new KeeperHubMcpClient({
			apiKey: "kh_test",
			logger: silentLogger,
			fetchFn: fn,
		});
		await expect(client.callTool("list_workflows", {})).rejects.toThrow(/401/);
		// initialize, tools/call (401), re-initialize, tools/call (401) -> stop. No loop.
		expect(calls).toHaveLength(4);
	});

	it("re-initializes at most once on a persistent session 404, then throws", async () => {
		const { fn, calls } = captureFetch([
			() => jsonResponse({ result: {} }, { sessionId: "sess-old" }),
			() => textResponse("session expired", { status: 404 }),
			() => jsonResponse({ result: {} }, { sessionId: "sess-new" }),
			() => textResponse("session expired", { status: 404 }),
		]);

		const client = new KeeperHubMcpClient({
			apiKey: "kh_test",
			logger: silentLogger,
			fetchFn: fn,
		});
		await expect(client.callTool("list_workflows", {})).rejects.toThrow(/404/);
		expect(calls).toHaveLength(4);
	});

	it("rejects empty api key", () => {
		expect(
			() =>
				new KeeperHubMcpClient({
					apiKey: "",
					logger: silentLogger,
				}),
		).toThrow(/non-empty apiKey/);
	});

	it("rejects wfb_ keys at construction", () => {
		expect(
			() =>
				new KeeperHubMcpClient({
					apiKey: "wfb_webhook_only",
					logger: silentLogger,
				}),
		).toThrow(/wfb_/);
	});
});

describe("getClient singleton", () => {
	beforeEach(() => __resetClientForTests());
	afterEach(() => __resetClientForTests());

	it("returns the same instance for the same api key", () => {
		expect(getClient("kh_one")).toBe(getClient("kh_one"));
	});

	it("replaces the instance when the api key changes", () => {
		const a = getClient("kh_one");
		const b = getClient("kh_two");
		expect(a).not.toBe(b);
	});
});
