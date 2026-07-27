"""AsyncKeeperHubMcpClient MCP transport with mocked HTTP.

Mirrors test_client.py case for case. Driven with asyncio.run() so the suite
keeps its current dev dependencies (pytest + httpx, no pytest-asyncio).
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from keeperhub_mcp import (
    AsyncKeeperHubMcpClient,
    reset_async_client_for_tests,
)


def make_client(handler) -> AsyncKeeperHubMcpClient:
    return AsyncKeeperHubMcpClient(
        "kh_test",
        http_client=httpx.AsyncClient(
            transport=httpx.MockTransport(handler), timeout=10.0
        ),
    )


def test_wfb_rejected_for_mcp():
    with pytest.raises(ValueError, match="wfb_"):
        AsyncKeeperHubMcpClient("wfb_webhook_key")


def test_empty_key_rejected():
    with pytest.raises(ValueError, match="non-empty"):
        AsyncKeeperHubMcpClient("   ")


def test_initialize_and_tools_call_roundtrip():
    calls = {"n": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        calls["n"] += 1
        rid = body["id"]
        if body["method"] == "initialize":
            return httpx.Response(
                200,
                headers={"mcp-session-id": "test-session"},
                json={"jsonrpc": "2.0", "id": rid, "result": {}},
            )
        if body["method"] == "tools/call":
            assert request.headers.get("mcp-session-id") == "test-session"
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {
                        "content": [
                            {"type": "text", "text": json.dumps({"answer": 42})}
                        ],
                    },
                },
            )
        return httpx.Response(400, json={"error": "unknown method"})

    async def run():
        client = make_client(handler)
        try:
            assert await client.call_tool("demo_tool", {"x": 1}) == {"answer": 42}
            assert calls["n"] == 2
        finally:
            await client.aclose()
            reset_async_client_for_tests()

    asyncio.run(run())


def test_401_triggers_reinitialize():
    phase = {"initialize": 0, "tools": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        rid = body["id"]
        if body["method"] == "initialize":
            phase["initialize"] += 1
            return httpx.Response(
                200,
                headers={"mcp-session-id": f"sess-{phase['initialize']}"},
                json={"jsonrpc": "2.0", "id": rid, "result": {}},
            )
        if body["method"] == "tools/call":
            phase["tools"] += 1
            if phase["tools"] == 1:
                return httpx.Response(401, text="unauthorized")
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": rid,
                    "result": {"content": [{"type": "text", "text": '"ok"'}]},
                },
            )
        return httpx.Response(400)

    async def run():
        c = make_client(handler)
        try:
            assert await c.call_tool("t", {}) == "ok"
            assert phase["initialize"] == 2
        finally:
            await c.aclose()

    asyncio.run(run())


def test_persistent_401_reinit_cap():
    calls = {"n": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        rid = body["id"]
        calls["n"] += 1
        if body["method"] == "initialize":
            return httpx.Response(
                200,
                headers={"mcp-session-id": f"sess-{calls['n']}"},
                json={"jsonrpc": "2.0", "id": rid, "result": {}},
            )
        if body["method"] == "tools/call":
            return httpx.Response(401, text="unauthorized")
        return httpx.Response(400)

    async def run():
        c = make_client(handler)
        try:
            with pytest.raises(RuntimeError, match=r"401"):
                await c.call_tool("list_workflows", {})
            # initialize, tools/call (401), re-initialize, tools/call (401) -> stop
            assert calls["n"] == 4
        finally:
            await c.aclose()

    asyncio.run(run())


def test_persistent_session_404_reinit_cap():
    calls = {"n": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        rid = body["id"]
        calls["n"] += 1
        if body["method"] == "initialize":
            return httpx.Response(
                200,
                headers={"mcp-session-id": f"sess-{calls['n']}"},
                json={"jsonrpc": "2.0", "id": rid, "result": {}},
            )
        if body["method"] == "tools/call":
            return httpx.Response(404, text="session expired")
        return httpx.Response(400)

    async def run():
        c = make_client(handler)
        try:
            with pytest.raises(RuntimeError, match=r"404"):
                await c.call_tool("list_workflows", {})
            assert calls["n"] == 4
        finally:
            await c.aclose()

    asyncio.run(run())


def test_tool_error_is_raised():
    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        rid = body["id"]
        if body["method"] == "initialize":
            return httpx.Response(
                200,
                headers={"mcp-session-id": "sess-1"},
                json={"jsonrpc": "2.0", "id": rid, "result": {}},
            )
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": rid,
                "result": {
                    "isError": True,
                    "content": [{"type": "text", "text": "insufficient funds"}],
                },
            },
        )

    async def run():
        c = make_client(handler)
        try:
            with pytest.raises(RuntimeError, match="insufficient funds"):
                await c.call_tool("execute_contract_call", {})
        finally:
            await c.aclose()

    asyncio.run(run())


def test_concurrent_calls_share_one_session():
    """The lock must serialize session bootstrap, not one init per caller."""
    counts = {"initialize": 0, "tools": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        rid = body["id"]
        if body["method"] == "initialize":
            counts["initialize"] += 1
            await asyncio.sleep(0)
            return httpx.Response(
                200,
                headers={"mcp-session-id": "sess-1"},
                json={"jsonrpc": "2.0", "id": rid, "result": {}},
            )
        counts["tools"] += 1
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": rid,
                "result": {"content": [{"type": "text", "text": '"ok"'}]},
            },
        )

    async def run():
        c = make_client(handler)
        try:
            results = await asyncio.gather(
                *(c.call_tool("list_workflows", {}) for _ in range(5))
            )
            assert results == ["ok"] * 5
            assert counts["initialize"] == 1
            assert counts["tools"] == 5
        finally:
            await c.aclose()

    asyncio.run(run())


def test_lock_binds_to_the_running_loop():
    """A client built outside a loop must still work inside asyncio.run()."""

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        rid = body["id"]
        if body["method"] == "initialize":
            return httpx.Response(
                200,
                headers={"mcp-session-id": "sess-1"},
                json={"jsonrpc": "2.0", "id": rid, "result": {}},
            )
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": rid,
                "result": {"content": [{"type": "text", "text": '"ok"'}]},
            },
        )

    client = make_client(handler)

    async def run():
        try:
            assert await client.call_tool("t", {}) == "ok"
        finally:
            await client.aclose()

    asyncio.run(run())
