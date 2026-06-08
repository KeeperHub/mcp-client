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

## Develop

```bash
cd python
pip install -e ".[dev]"
pytest
```

## License

Apache-2.0
