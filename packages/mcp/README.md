# @keeperhub/mcp

Official TypeScript client for the KeeperHub MCP HTTP endpoint (`https://app.keeperhub.com/mcp`).

## Features

- Lazy MCP session (`initialize` + `mcp-session-id`)
- `tools/call` with JSON parsing of `content[0].text`
- Automatic re-init on **401** and **404** session expiry
- API key resolution (`KH_API_KEY`, `KEEPERHUB_API_KEY`)
- Key types: `kh_` (organization — MCP/REST) vs `wfb_` (webhooks only)

## Usage

```ts
import { getClient, resolveApiKey } from "@keeperhub/mcp";

const apiKey = resolveApiKey({ env: process.env });
if (!apiKey) throw new Error("KH_API_KEY not set");

const client = getClient(apiKey, {
	clientInfo: { name: "my-plugin", version: "1.0.0" },
});

const workflows = await client.callTool("list_workflows", {});
```

## Develop

```bash
pnpm install
pnpm --filter @keeperhub/mcp build
pnpm --filter @keeperhub/mcp test
```

## License

Apache-2.0
