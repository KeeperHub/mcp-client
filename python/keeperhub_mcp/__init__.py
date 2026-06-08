"""KeeperHub MCP HTTP client for Python integrators."""

from keeperhub_mcp.client import (
    DEFAULT_MCP_URL,
    MCP_PROTOCOL_VERSION,
    KeeperHubMcpClient,
    get_client,
    reset_client_for_tests,
)
from keeperhub_mcp.keys import (
    ENV_VAR_NAMES,
    ORG_KEY_HINT,
    SUPPORTED_ENV_VARS,
    WFB_KEY_NOT_FOR_MCP_MESSAGE,
    classify_api_key,
    get_api_key_kind_warning,
    is_likely_valid_api_key,
    is_likely_valid_org_api_key,
    is_org_api_key,
    mask_api_key,
    resolve_api_key,
    validate_api_key_for_mcp,
)

KeeperHubClient = KeeperHubMcpClient

__version__ = "0.1.0"

__all__ = [
    "DEFAULT_MCP_URL",
    "ENV_VAR_NAMES",
    "KeeperHubClient",
    "KeeperHubMcpClient",
    "MCP_PROTOCOL_VERSION",
    "SUPPORTED_ENV_VARS",
    "ORG_KEY_HINT",
    "WFB_KEY_NOT_FOR_MCP_MESSAGE",
    "__version__",
    "classify_api_key",
    "get_api_key_kind_warning",
    "get_client",
    "is_likely_valid_api_key",
    "is_likely_valid_org_api_key",
    "is_org_api_key",
    "mask_api_key",
    "reset_client_for_tests",
    "resolve_api_key",
    "validate_api_key_for_mcp",
]
