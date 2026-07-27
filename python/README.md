# keeperhub-mcp

Python MCP client foundation for connecting agent frameworks (Hermes and others) to [KeeperHub](https://keeperhub.com).

The Python counterpart to [`@keeperhub/mcp`](https://www.npmjs.com/package/@keeperhub/mcp). Implements the same kernel: MCP session bootstrap + re-init on `401`/`404`, `kh_` vs `wfb_` key disambiguation, and single JSON-result unwrap.

## Usage

```python
from keeperhub_mcp import get_client, resolve_api_key

api_key = resolve_api_key()
if not api_key:
    raise RuntimeError("KH_API_KEY not set")

client = get_client(api_key, client_name="my-plugin", client_version="1.0.0")
workflows = client.call_tool("list_workflows", {})
```

### Async

Agent frameworks that run an asyncio event loop (OpenAI Agents SDK, LangChain,
anything built on `httpx.AsyncClient`) should use the async client. The sync
client blocks the loop for the whole MCP round trip, which stalls every other
task the agent has in flight.

```python
import asyncio

from keeperhub_mcp import AsyncKeeperHubMcpClient, resolve_api_key


async def main():
    api_key = resolve_api_key()
    if not api_key:
        raise RuntimeError("KH_API_KEY not set")

    client = AsyncKeeperHubMcpClient(
        api_key, client_name="my-plugin", client_version="1.0.0"
    )
    try:
        workflows = await client.call_tool("list_workflows", {})
        print(workflows)
    finally:
        await client.aclose()


asyncio.run(main())
```

`AsyncKeeperHubMcpClient` mirrors `KeeperHubMcpClient` exactly: same session
bootstrap, same 401/404 re-init behaviour, same single JSON-result unwrap, same
error messages. Concurrent `call_tool` calls share one session; the bootstrap is
serialized by an internal lock created on the running loop.

`get_async_client(api_key)` provides the same per-key caching as `get_client`,
but does not close a superseded client, because `aclose()` is a coroutine. If you
rotate keys, await `aclose()` on the client you are discarding.

## Develop

```bash
cd python
pip install -e ".[dev]"
pytest
```

## License

Apache-2.0
