# keeperhub-mcp-client

Python MCP client foundation for connecting agent frameworks (Hermes and others) to [KeeperHub](https://keeperhub.com).

The Python counterpart to [`@keeperhub/mcp-client`](https://github.com/KeeperHub/mcp-client). Implements the same kernel: MCP session bootstrap + re-init on `401`/`404`, `kh_` vs `wfb_` key disambiguation, poll-to-terminal, and single JSON-result unwrap.

## Status

Early development. Not yet published to PyPI.

## License

Apache-2.0
