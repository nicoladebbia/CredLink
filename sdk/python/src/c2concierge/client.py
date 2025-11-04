"""
Main client implementation for the C2 Concierge SDK
"""

import asyncio
import uuid
from typing import Any, AsyncIterable, Dict, List, Optional, Union
from urllib.parse import urlparse

import httpx

from .types import (
    ClientConfig,
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
    RequestOptions,
    AsyncPageVerificationResult,
    AsyncBatchVerificationResult,
    JobStatus,
    C2ConciergeError,
    ValidationError,
)
from .transport import HttpTransport, TelemetryManager


class Client:
    """
    Main C2 Concierge client for cryptographic provenance verification and signing
    
    Example:
        import asyncio
        from c2concierge import Client
        
        async def main():
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
    
    asyncio.run(main())
    """
    
    def __init__(self, config: Union[str, ClientConfig]):
        """
        Initialize the client
        
        Args:
            config: API key string or ClientConfig object
        """
        if isinstance(config, str):
            config = ClientConfig(api_key=config)
        
        if not config.api_key or not config.api_key.strip():
            raise ValueError("API key is required")
        
        self.transport = HttpTransport(config)
        self.telemetry = TelemetryManager(config.telemetry)
    
    async def __aenter__(self):
        """Async context manager entry"""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()
    
    async def close(self):
        """Close the client and clean up resources"""
        await self.transport.close()
    
    # ============================================================================
    # Asset Verification
    # ============================================================================
    
    async def verify_asset(
        self,
        url_or_buffer: str,
        options: Dict[str, Any]
    ) -> VerifyAssetResponse:
        """
        Verify a single asset by URL or direct content
        
        Args:
            url_or_buffer: Asset URL or base64-encoded content
            options: Verification options including policy_id
            
        Returns:
            Verification response with result and metadata
        """
        # Determine if this is a URL or buffer
        is_url = urlparse(url_or_buffer).scheme in ('http', 'https')
        
        if is_url:
            request = VerifyAssetRequest(
                asset_url=url_or_buffer,
                **options
            )
        else:
            if 'content_type' not in options:
                raise ValidationError("content_type is required when verifying by buffer")
            request = VerifyAssetRequest(
                asset_buffer=url_or_buffer,
                **options
            )
        
        return await self.transport.post(
            "/verify/asset",
            request.dict(exclude_none=True),
            VerifyAssetResponse
        )
    
    async def verify_page(
        self,
        page_url: str,
        options: Optional[Dict[str, Any]] = None
    ) -> AsyncIterable[AsyncPageVerificationResult]:
        """
        Verify all assets on a web page
        
        Args:
            page_url: URL of the page to verify
            options: Optional verification parameters
            
        Yields:
            Asset verification results as they're processed
        """
        options = options or {}
        request = VerifyPageRequest(
            page_url=page_url,
            **options
        )
        
        async for result in self.transport.stream_post(
            "/verify/page",
            request.dict(exclude_none=True),
            AsyncPageVerificationResult
        ):
            yield result
    
    async def batch_verify(
        self,
        assets: List[str],
        options: Optional[Dict[str, Any]] = None
    ) -> AsyncIterable[AsyncBatchVerificationResult]:
        """
        Batch verify multiple assets
        
        Args:
            assets: List of asset URLs to verify
            options: Optional verification parameters
            
        Yields:
            Batch verification results as they're processed
        """
        options = options or {}
        request = BatchVerifyRequest(
            assets=[{"url": url} for url in assets],
            **options
        )
        
        async for result in self.transport.stream_post(
            "/batch/verify",
            request.dict(exclude_none=True),
            AsyncBatchVerificationResult
        ):
            yield result
    
    # ============================================================================
    # Link Management
    # ============================================================================
    
    async def inject_link(
        self,
        html: str,
        options: Dict[str, Any]
    ) -> InjectLinkResponse:
        """
        Inject C2PA manifest links into HTML content
        
        Args:
            html: HTML content to modify
            options: Injection options including manifest_url
            
        Returns:
            Modified HTML with injected links
        """
        request = InjectLinkRequest(
            html=html,
            **options
        )
        
        return await self.transport.post(
            "/link/inject",
            request.dict(exclude_none=True),
            InjectLinkResponse
        )
    
    # ============================================================================
    # Signing Operations
    # ============================================================================
    
    async def sign_folder(
        self,
        folder_path: str,
        options: Dict[str, Any]
    ) -> SignFolderResponse:
        """
        Sign all C2PA-compatible assets in a folder
        
        Args:
            folder_path: Path to folder containing assets to sign
            options: Signing options including profile_id
            
        Returns:
            Job information for tracking signing progress
        """
        request = SignFolderRequest(
            folder_path=folder_path,
            **options
        )
        
        return await self.transport.post(
            "/sign/folder",
            request.dict(exclude_none=True),
            SignFolderResponse
        )
    
    async def get_job_status(self, job_id: str) -> JobStatus:
        """
        Get the status of a signing job
        
        Args:
            job_id: Job ID returned from sign_folder
            
        Returns:
            Current job status and progress
        """
        return await self.transport.get(
            f"/jobs/{job_id}",
            JobStatus
        )
    
    # ============================================================================
    # Manifest Operations
    # ============================================================================
    
    async def get_manifest(
        self,
        hash: str,
        options: Optional[Dict[str, Any]] = None
    ) -> ManifestResponse:
        """
        Get a manifest by its content hash
        
        Args:
            hash: Content hash of the manifest
            options: Optional request parameters
            
        Returns:
            Manifest metadata and content
        """
        params = options or {}
        return await self.transport.get(
            f"/manifests/{hash}",
            ManifestResponse,
            params=params
        )
    
    async def put_manifest(
        self,
        hash: str,
        content: Union[str, bytes],
        options: Optional[Dict[str, Any]] = None
    ) -> ManifestResponse:
        """
        Store or update a manifest
        
        Args:
            hash: Content hash of the manifest
            content: Manifest content
            options: Optional request parameters
            
        Returns:
            Stored manifest metadata
        """
        options = options or {}
        request = ManifestRequest(
            content=content,
            **options
        )
        
        return await self.transport.put(
            f"/manifests/{hash}",
            request.dict(exclude_none=True),
            ManifestResponse
        )
