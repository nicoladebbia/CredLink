"""
CredLink SDK - Python v1.3.0

A comprehensive SDK for cryptographic provenance verification and signing.
Features include:
- HTTP API wrapper with automatic retries and backoff
- Circuit breaker for resilience
- Comprehensive error handling with actionable hints
- Optional OpenTelemetry telemetry
- Full type hints with Pydantic models
- Idempotency support for safe retries
- Async/await support for streaming responses

Example:
    import asyncio
    from credlink import Client
    
    client = Client(api_key="your-api-key")
    
    # Verify an asset
    result = await client.verify_asset(
        "https://example.com/image.jpg",
        policy_id="default"
    )
    
    # Verify page assets during build
    async for asset in client.verify_page("https://site.example/article"):
        if not asset.verified:
            raise Exception(f"Verification failed: {asset.error}")
"""

__version__ = "1.3.0"
__author__ = "CredLink Team"
__email__ = "team@credlink.com"

from .client import Client
from .types import (
    # Configuration
    ClientConfig,
    TelemetryConfig,
    RetryConfig,
    RequestOptions,
    
    # Error types
    C2ConciergeError,
    AuthError,
    RateLimitError,
    ConflictError,
    ValidationError,
    ServerError,
    NetworkError,
    
    # API models - Requests
    VerifyAssetRequest,
    VerifyAssetResponse,
    VerifyPageRequest,
    VerifyPageResponse,
    BatchVerifyRequest,
    BatchVerifyResponse,
    InjectLinkRequest,
    InjectLinkResponse,
    SignFolderRequest,
    SignFolderResponse,
    ManifestRequest,
    ManifestResponse,
    
    # Utility types
    IdempotencyKey,
    PaginationOptions,
    JobStatus,
    AsyncPageVerificationResult,
    AsyncBatchVerificationResult,
)

__all__ = [
    # Version
    "__version__",
    
    # Main client
    "Client",
    
    # Configuration
    "ClientConfig",
    "TelemetryConfig", 
    "RetryConfig",
    "RequestOptions",
    
    # Error types
    "C2ConciergeError",
    "AuthError",
    "RateLimitError",
    "ConflictError",
    "ValidationError",
    "ServerError",
    "NetworkError",
    
    # API models - Requests
    "VerifyAssetRequest",
    "VerifyAssetResponse",
    "VerifyPageRequest",
    "VerifyPageResponse",
    "BatchVerifyRequest",
    "BatchVerifyResponse",
    "InjectLinkRequest",
    "InjectLinkResponse",
    "SignFolderRequest",
    "SignFolderResponse",
    "ManifestRequest",
    "ManifestResponse",
    
    # Utility types
    "IdempotencyKey",
    "PaginationOptions",
    "JobStatus",
    "AsyncPageVerificationResult",
    "AsyncBatchVerificationResult",
]
