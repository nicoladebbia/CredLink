"""
Core types and models for the CredLink SDK
Generated from OpenAPI specification v1.3.0
"""

import datetime
from typing import Any, Dict, List, Optional, Union, Literal
from uuid import UUID
from pydantic import BaseModel, Field, HttpUrl, field_validator


# ============================================================================
# Configuration Types
# ============================================================================

class RetryConfig(BaseModel):
    """Configuration for retry behavior"""
    max_attempts: int = Field(default=5, ge=1, le=10, description="Maximum number of retry attempts")
    base_ms: int = Field(default=250, ge=100, le=5000, description="Base delay in milliseconds")
    max_ms: int = Field(default=5000, ge=1000, le=60000, description="Maximum delay in milliseconds")
    jitter: bool = Field(default=True, description="Enable jitter for backoff")


class TelemetryConfig(BaseModel):
    """Configuration for OpenTelemetry telemetry"""
    enabled: bool = Field(default=False, description="Enable OpenTelemetry telemetry")
    otel: Optional[Dict[str, str]] = Field(default=None, description="OpenTelemetry configuration")


class ClientConfig(BaseModel):
    """Configuration for the CredLink client"""
    api_key: str = Field(..., description="API key for authentication")
    base_url: str = Field(default="https://api.credlink.com/v1", description="Base URL for the API")
    timeout_ms: int = Field(default=30000, ge=1000, le=300000, description="Request timeout in milliseconds")
    telemetry: Optional[TelemetryConfig] = Field(default=None, description="Telemetry configuration")
    retries: Optional[RetryConfig] = Field(default=None, description="Retry configuration")
    user_agent: Optional[str] = Field(default=None, description="Custom user agent string")

    @field_validator('api_key')
    @classmethod
    def validate_api_key(cls, v):
        if not v or not v.strip():
            raise ValueError('API key cannot be empty')
        return v.strip()


class RequestOptions(BaseModel):
    """Options for individual requests"""
    timeout: Optional[int] = Field(default=None, ge=1000, le=300000, description="Request timeout override")
    idempotency_key: Optional[str] = Field(default=None, description="Idempotency key for safe retries")
    headers: Optional[Dict[str, str]] = Field(default=None, description="Custom headers")
    retries: Optional[RetryConfig] = Field(default=None, description="Retry configuration override")


# ============================================================================
# Error Types
# ============================================================================

class CredLinkError(Exception):
    """Base class for all CredLink errors"""
    
    def __init__(
        self,
        message: str,
        code: str,
        status_code: int,
        request_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        hint: Optional[str] = None,
        docs_url: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.request_id = request_id
        self.idempotency_key = idempotency_key
        self.endpoint = endpoint
        self.hint = hint
        self.docs_url = docs_url
        self.timestamp = datetime.datetime.utcnow().isoformat()

    def get_summary(self) -> str:
        """Returns a search-engine friendly summary line"""
        return f"C2C {self.__class__.__name__}: {self.status_code} - {self.message}"

    def get_next_steps(self) -> List[str]:
        """Returns actionable next steps"""
        return ["Check the API documentation", "Contact support if the issue persists"]


class AuthError(CredLinkError):
    """Authentication error (401/403)"""
    
    def __init__(self, message: str = "Authentication failed", **kwargs):
        super().__init__(
            message=message,
            code="AUTH_ERROR",
            status_code=401,
            hint=kwargs.pop('hint', 'Check your API key in the X-API-Key header'),
            docs_url="https://docs.credlink.com/api/errors#auth_error",
            **kwargs
        )

    def get_next_steps(self) -> List[str]:
        return [
            "Verify your API key is correct",
            "Check the X-API-Key header format",
            "Ensure your API key is active and not expired",
            "Contact support if the issue persists",
        ]


class RateLimitError(CredLinkError):
    """Rate limit error (429)"""
    
    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
        attempt_count: Optional[int] = None,
        **kwargs
    ):
        super().__init__(
            message=message,
            code="RATE_LIMIT_ERROR",
            status_code=429,
            hint=kwargs.pop('hint', 'Wait before retrying or implement exponential backoff'),
            docs_url="https://docs.credlink.com/api/errors#rate_limit_error",
            **kwargs
        )
        self.retry_after = retry_after
        self.attempt_count = attempt_count

    def get_summary(self) -> str:
        retry_info = f" (Retry-After={self.retry_after}s)" if self.retry_after else ""
        return f"C2C RateLimitError: 429{retry_info} - {self.message}"

    def get_next_steps(self) -> List[str]:
        steps = [
            "Implement exponential backoff with jitter",
            "Honor the Retry-After header if provided",
            "Consider reducing request frequency",
        ]
        
        if self.retry_after:
            steps.append(f"Wait {self.retry_after} seconds before retrying")
        
        steps.append("Contact support for rate limit increases")
        return steps


class ConflictError(CredLinkError):
    """Conflict error (409)"""
    
    def __init__(self, message: str = "Request conflicts with current state", **kwargs):
        super().__init__(
            message=message,
            code="CONFLICT_ERROR",
            status_code=409,
            hint=kwargs.pop('hint', 'Use a different idempotency key or check resource state'),
            docs_url="https://docs.credlink.com/api/errors#conflict_error",
            **kwargs
        )

    def get_summary(self) -> str:
        key_info = f" (key={self.idempotency_key})" if self.idempotency_key else ""
        return f"C2C ConflictError: 409{key_info} - {self.message}"

    def get_next_steps(self) -> List[str]:
        return [
            "Use a different idempotency key for new requests",
            "Check current resource state before retrying",
            "Verify request body matches idempotency key",
            "Consider using a different resource identifier",
        ]


class ValidationError(CredLinkError):
    """Validation error (422)"""
    
    def __init__(self, message: str = "Request data failed validation", **kwargs):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=422,
            hint=kwargs.pop('hint', 'Check required fields and data formats'),
            docs_url="https://docs.credlink.com/api/errors#validation_error",
            **kwargs
        )

    def get_next_steps(self) -> List[str]:
        return [
            "Check that all required fields are provided",
            "Verify data types and formats match the schema",
            "Check parameter constraints (min/max values)",
            "Review API documentation for request format",
        ]


class ServerError(CredLinkError):
    """Server error (5xx)"""
    
    def __init__(self, message: str = "Server encountered an unexpected error", **kwargs):
        super().__init__(
            message=message,
            code="SERVER_ERROR",
            status_code=500,
            hint=kwargs.pop('hint', 'Server encountered an unexpected error'),
            docs_url="https://docs.credlink.com/api/errors#server_error",
            **kwargs
        )

    def get_next_steps(self) -> List[str]:
        return [
            "Retry the request with exponential backoff",
            "Check service status page for outages",
            "Contact support if the issue persists",
            "Consider implementing circuit breaker pattern",
        ]


class NetworkError(CredLinkError):
    """Network error"""
    
    def __init__(self, message: str = "Network connectivity issue encountered", **kwargs):
        super().__init__(
            message=message,
            code="NETWORK_ERROR",
            status_code=0,
            hint=kwargs.pop('hint', 'Network connectivity issue encountered'),
            docs_url="https://docs.credlink.com/api/errors#network_error",
            **kwargs
        )

    def get_next_steps(self) -> List[str]:
        return [
            "Check network connectivity",
            "Verify firewall and proxy settings",
            "Retry with exponential backoff",
            "Check DNS resolution for API endpoint",
        ]


# ============================================================================
# API Request/Response Models
# ============================================================================

class VerificationResult(BaseModel):
    """Result of asset verification"""
    verified: bool = Field(..., description="Whether the asset was successfully verified")
    manifest_url: Optional[HttpUrl] = Field(default=None, description="URL of the manifest")
    trust_roots: Optional[List[str]] = Field(default=None, description="Trust roots used for verification")
    policy_version: Optional[str] = Field(default=None, description="Policy version used")
    verification_time: Optional[datetime.datetime] = Field(default=None, description="When verification occurred")
    cached: bool = Field(default=False, description="True if result came from cache")


class VerifyAssetRequest(BaseModel):
    """Request to verify a single asset"""
    asset_url: Optional[HttpUrl] = Field(default=None, description="URL of the asset to verify")
    asset_buffer: Optional[str] = Field(default=None, description="Base64-encoded asset content")
    content_type: Optional[str] = Field(default=None, description="Content type for buffer verification")
    policy_id: str = Field(..., description="Verification policy to use")
    timeout: Optional[int] = Field(default=5000, ge=1000, le=30000, description="Request timeout in milliseconds")
    cached_etag: Optional[str] = Field(default=None, description="Cached ETag for conditional requests")
    cached_cert_thumbprints: Optional[List[str]] = Field(default=None, max_items=50, description="Cached certificate thumbprints")
    enable_delta: bool = Field(default=False, description="Enable RFC 3229 delta encoding")

    @field_validator('cached_cert_thumbprints')
    @classmethod
    def validate_thumbprints(cls, v):
        if v is not None:
            for thumbprint in v:
                if not thumbprint or not all(c in '0123456789abcdefABCDEF:' for c in thumbprint):
                    raise ValueError('Invalid certificate thumbprint format')
        return v

    @field_validator('cached_etag')
    @classmethod
    def validate_etag(cls, v):
        if v is not None and not (v.startswith('"') and v.endswith('"')):
            raise ValueError('ETag must be quoted (e.g., "abc123")')
        return v


class VerifyAssetResponse(BaseModel):
    """Response from asset verification"""
    success: bool = Field(..., description="Whether the request was successful")
    data: VerificationResult = Field(..., description="Verification result")
    request_id: str = Field(..., description="Unique request identifier")
    timestamp: datetime.datetime = Field(..., description="Response timestamp")


class AssetVerificationResult(BaseModel):
    """Result for a single asset in page verification"""
    url: HttpUrl = Field(..., description="Asset URL")
    verified: bool = Field(..., description="Whether the asset was verified")
    manifest_url: Optional[HttpUrl] = Field(default=None, description="Manifest URL if verified")
    error: Optional[str] = Field(default=None, description="Error message if verification failed")


class VerifyPageRequest(BaseModel):
    """Request to verify all assets on a page"""
    page_url: HttpUrl = Field(..., description="URL of the page to verify")
    follow_links: bool = Field(default=True, description="Whether to follow links to discover more assets")
    max_depth: int = Field(default=2, ge=1, le=5, description="Maximum depth to follow links")
    policy_id: str = Field(default="default", description="Verification policy to use")
    timeout: Optional[int] = Field(default=15000, ge=5000, le=60000, description="Total timeout for page verification")


class VerifyPageResponse(BaseModel):
    """Response from page verification"""
    success: bool = Field(..., description="Whether the request was successful")
    data: Dict[str, Any] = Field(..., description="Page verification results")
    request_id: str = Field(..., description="Unique request identifier")
    timestamp: datetime.datetime = Field(..., description="Response timestamp")


class AssetReference(BaseModel):
    """Reference to an asset for batch verification"""
    url: HttpUrl = Field(..., description="URL of the asset to verify")
    id: Optional[str] = Field(default=None, description="Optional identifier for the asset")


class BatchVerifyRequest(BaseModel):
    """Request to verify multiple assets"""
    assets: List[AssetReference] = Field(..., min_items=1, max_items=100, description="List of assets to verify")
    policy_id: str = Field(default="default", description="Verification policy to use")
    parallel: bool = Field(default=True, description="Whether to process assets in parallel")
    timeout_per_asset: Optional[int] = Field(default=5000, ge=1000, le=30000, description="Timeout per asset in milliseconds")


class BatchVerifyResponse(BaseModel):
    """Response from batch verification"""
    success: bool = Field(..., description="Whether the request was successful")
    data: Dict[str, Any] = Field(..., description="Batch verification results")
    request_id: str = Field(..., description="Unique request identifier")
    timestamp: datetime.datetime = Field(..., description="Response timestamp")


class InjectLinkRequest(BaseModel):
    """Request to inject Link headers into HTML"""
    html: str = Field(..., description="HTML content to modify")
    manifest_url: HttpUrl = Field(..., description="Base URL for manifest links")
    strategy: Literal["sha256_path", "content_hash", "custom"] = Field(default="sha256_path", description="Strategy for generating manifest URLs")
    selector: Optional[str] = Field(default="img[src], video[src], audio[src]", description="CSS selector for elements to process")


class InjectLinkResponse(BaseModel):
    """Response from Link injection"""
    success: bool = Field(..., description="Whether the request was successful")
    data: Dict[str, Any] = Field(..., description="Link injection results")
    request_id: str = Field(..., description="Unique request identifier")
    timestamp: datetime.datetime = Field(..., description="Response timestamp")


class SignFolderRequest(BaseModel):
    """Request to sign a folder"""
    folder_path: str = Field(..., description="Path to folder containing assets to sign")
    profile_id: str = Field(..., description="Signing profile to use")
    tsa: bool = Field(default=False, description="Include RFC-3161 timestamps")
    recursive: bool = Field(default=True, description="Process subdirectories recursively")
    file_patterns: Optional[List[str]] = Field(default=["*.jpg", "*.png", "*.mp4", "*.pdf"], description="File patterns to include")
    idempotency_key: Optional[str] = Field(default=None, description="Optional idempotency key for request deduplication")

    @field_validator('idempotency_key')
    @classmethod
    def validate_idempotency_key(cls, v):
        if v is not None:
            try:
                UUID(v)
            except ValueError:
                raise ValueError('Idempotency key must be a valid UUID')
        return v


class SignFolderResponse(BaseModel):
    """Response from folder signing"""
    success: bool = Field(..., description="Whether the request was successful")
    data: Dict[str, Any] = Field(..., description="Folder signing results")
    request_id: str = Field(..., description="Unique request identifier")
    timestamp: datetime.datetime = Field(..., description="Response timestamp")


class ManifestRequest(BaseModel):
    """Request to store a manifest"""
    content: Optional[str] = Field(default=None, description="Manifest content")
    content_type: str = Field(default="application/c2pa", description="Content type of the manifest")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional manifest metadata")


class ManifestResponse(BaseModel):
    """Response from manifest operations"""
    success: bool = Field(..., description="Whether the request was successful")
    data: Dict[str, Any] = Field(..., description="Manifest operation results")
    request_id: str = Field(..., description="Unique request identifier")
    timestamp: datetime.datetime = Field(..., description="Response timestamp")


# ============================================================================
# Utility Types
# ============================================================================

IdempotencyKey = str


class PaginationOptions(BaseModel):
    """Options for paginated requests"""
    limit: Optional[int] = Field(default=None, ge=1, le=1000, description="Maximum number of results per page")
    token: Optional[str] = Field(default=None, description="Page token for pagination")


class JobStatus(BaseModel):
    """Status of a long-running job"""
    job_id: str = Field(..., description="Job identifier")
    status: Literal["pending", "running", "completed", "failed"] = Field(..., description="Current job status")
    progress: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Job progress percentage")
    result: Optional[Dict[str, Any]] = Field(default=None, description="Job result if completed")
    error: Optional[Dict[str, Any]] = Field(default=None, description="Error details if failed")
    created_at: datetime.datetime = Field(..., description="Job creation time")
    updated_at: datetime.datetime = Field(..., description="Last update time")
    estimated_completion: Optional[datetime.datetime] = Field(default=None, description="Estimated completion time")


# ============================================================================
# Async Iterator Types for Streaming Responses
# ============================================================================

class AsyncPageVerificationResult(BaseModel):
    """Result from async page verification"""
    url: HttpUrl = Field(..., description="Asset URL")
    verified: bool = Field(..., description="Whether the asset was verified")
    manifest_url: Optional[HttpUrl] = Field(default=None, description="Manifest URL if verified")
    error: Optional[str] = Field(default=None, description="Error message if verification failed")
    has_more: bool = Field(default=False, description="Whether more results are available")
    next_token: Optional[str] = Field(default=None, description="Token for next page of results")


class AsyncBatchVerificationResult(BaseModel):
    """Result from async batch verification"""
    asset: AssetReference = Field(..., description="Asset reference")
    result: Optional[VerificationResult] = Field(default=None, description="Verification result if successful")
    error: Optional[Dict[str, Any]] = Field(default=None, description="Error details if failed")
    has_more: bool = Field(default=False, description="Whether more results are available")
    next_token: Optional[str] = Field(default=None, description="Token for next page of results")
