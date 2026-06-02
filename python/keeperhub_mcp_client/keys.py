"""KeeperHub API key resolution and classification.

See KeeperHub docs: API Keys — kh_ (organization, MCP/REST) vs wfb_ (user, webhooks only).
"""

from __future__ import annotations

import os
from typing import Literal

ApiKeyKind = Literal["org", "webhook", "unknown"]

ENV_VAR_NAMES = ("KH_API_KEY", "KEEPERHUB_API_KEY")
SUPPORTED_ENV_VARS: tuple[str, ...] = ENV_VAR_NAMES

WFB_KEY_NOT_FOR_MCP_MESSAGE = (
    "This key starts with wfb_ (user webhook key from /api/api-keys). "
    "MCP and the REST API require an organization key (kh_) from "
    "Settings → API Keys → Organisation (/api/keys). "
    "The two key types are not interchangeable."
)

ORG_KEY_HINT = (
    "Use an organization API key (prefix kh_) from Settings → API Keys → Organisation."
)


def first_string(*values: object) -> str | None:
    for value in values:
        if isinstance(value, str):
            t = value.strip()
            if t:
                return t
    return None


def resolve_api_key(
    *,
    plugin_config: dict[str, object] | None = None,
    settings: tuple[str | None, ...] | None = None,
) -> str | None:
    """Resolve API key: plugin config apiKey, then settings, then env vars."""
    if plugin_config:
        v = first_string(plugin_config.get("apiKey"))
        if v:
            return v
    if settings:
        for item in settings:
            v = first_string(item)
            if v:
                return v
    for name in ENV_VAR_NAMES:
        v = first_string(os.environ.get(name, ""))
        if v:
            return v
    return None


def classify_api_key(api_key: str) -> ApiKeyKind:
    if api_key.startswith("kh_"):
        return "org"
    if api_key.startswith("wfb_"):
        return "webhook"
    return "unknown"


def is_org_api_key(api_key: str) -> bool:
    return classify_api_key(api_key) == "org"


def is_likely_valid_org_api_key(api_key: str) -> bool:
    return is_org_api_key(api_key)


def is_likely_valid_api_key(api_key: str) -> bool:
    return is_org_api_key(api_key)


def get_api_key_kind_warning(api_key: str) -> str | None:
    kind = classify_api_key(api_key)
    if kind == "org":
        return None
    if kind == "webhook":
        return WFB_KEY_NOT_FOR_MCP_MESSAGE
    return f"Key does not start with kh_. {ORG_KEY_HINT}"


def validate_api_key_for_mcp(api_key: str) -> None:
    warning = get_api_key_kind_warning(api_key)
    if warning:
        raise ValueError(f"KeeperHub API key: {warning}")


def mask_api_key(api_key: str) -> str:
    if len(api_key) <= 8:
        return "••••"
    return f"{api_key[:4]}…{api_key[-4:]}"
