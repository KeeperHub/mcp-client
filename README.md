# @keeperhub/mcp

Shared MCP client foundation for connecting agent frameworks to [KeeperHub](https://keeperhub.com).

This repo holds the small, framework-agnostic MCP kernel that framework adapters (Eliza, OpenClaw, Hermes, and others) build on. It is not itself a framework plugin — the per-framework plugins live in their respective framework ecosystems and import these clients.

## What's here

| Package | Language | Path | Registry |
| -- | -- | -- | -- |
| `@keeperhub/mcp` | TypeScript | `packages/mcp` | npm |
| `keeperhub-mcp` | Python | `python` | PyPI |

Both clients implement the same kernel:

- MCP session bootstrap + re-init on `401`/`404`
- `kh_` vs `wfb_` key disambiguation
- Single JSON-result unwrap

## Status

**v0.1.0** — MCP HTTP transport implemented (session bootstrap, `tools/call`, 401/404 re-init, API key helpers). Ready for first publish to npm and PyPI. See [`.github/workflows`](.github/workflows) for release tags (`npm-v*`, `py-v*`).

## Where the plugins live

Per the KeeperHub SDK strategy, framework plugins ship from their own ecosystems, not this repo:

- Eliza: `@elizaos/plugin-keeperhub` (ElizaOS org)
- OpenClaw: published in the OpenClaw ecosystem
- Hermes: gated on runtime confirmation

For agent users: point your MCP client at `https://app.keeperhub.com/mcp` directly when your framework supports MCP natively.

## License

[Apache-2.0](./LICENSE)
