"""KeeperHubMcpClient MCP transport with mocked HTTP."""

from __future__ import annotations

import json

import httpx
import pytest

from keeperhub_mcp import (
    KeeperHubMcpClient,
    classify_api_key,
    reset_client_for_tests,
)


def test_classify_api_key():
    assert classify_api_key("kh_x") == "org"
    assert classify_api_key("wfb_x") == "webhook"
    assert classify_api_key("x") == "unknown"


def test_wfb_rejected_for_mcp():
    with pytest.raises(ValueError, match="wfb_"):
        KeeperHubMcpClient("wfb_webhook_key")


def test_initialize_and_tools_call_roundtrip():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
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
                        "content": [{"type": "text", "text": json.dumps({"answer": 42})}],
                    },
                },
            )
        return httpx.Response(400, json={"error": "unknown method"})

    transport = httpx.MockTransport(handler)
    client = KeeperHubMcpClient(
        "kh_test", http_client=httpx.Client(transport=transport, timeout=10.0)
    )
    try:
        assert client.call_tool("demo_tool", {"x": 1}) == {"answer": 42}
        assert calls["n"] == 2
    finally:
        client.close()
        reset_client_for_tests()


def test_401_triggers_reinitialize():
    phase = {"initialize": 0, "tools": 0}

    def handler(request: httpx.Request) -> httpx.Response:
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

    transport = httpx.MockTransport(handler)
    c = KeeperHubMcpClient("kh_test", http_client=httpx.Client(transport=transport, timeout=10.0))
    try:
        assert c.call_tool("t", {}) == "ok"
        assert phase["initialize"] == 2
    finally:
        c.close()


def test_persistent_401_reinit_cap():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
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

    transport = httpx.MockTransport(handler)
    c = KeeperHubMcpClient("kh_test", http_client=httpx.Client(transport=transport, timeout=10.0))
    try:
        with pytest.raises(RuntimeError, match=r"401"):
            c.call_tool("list_workflows", {})
        # initialize, tools/call (401), re-initialize, tools/call (401) -> stop
        assert calls["n"] == 4
    finally:
        c.close()


def test_persistent_session_404_reinit_cap():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
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

    transport = httpx.MockTransport(handler)
    c = KeeperHubMcpClient("kh_test", http_client=httpx.Client(transport=transport, timeout=10.0))
    try:
        with pytest.raises(RuntimeError, match=r"404"):
            c.call_tool("list_workflows", {})
        assert calls["n"] == 4
    finally:
        c.close()
