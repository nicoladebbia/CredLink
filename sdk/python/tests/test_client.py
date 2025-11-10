"""
Tests for C2 Concierge SDK Python
"""

import pytest
import os
from unittest.mock import Mock, patch

from credlink import (
    Client,
    ClientConfig,
    ValidationError,
    AuthError,
    RateLimitError,
)


class TestClient:
    """Test cases for Client class"""

    def test_client_creation_with_api_key(self):
        """Test creating a client with API key"""
        client = Client(api_key="test-api-key")
        assert client is not None
        assert isinstance(client, Client)

    def test_client_creation_with_config(self):
        """Test creating a client with full configuration"""
        config = ClientConfig(
            api_key="test-api-key",
            base_url="https://test.api.com",
            timeout_ms=5000,
            retries={
                "max_attempts": 3,
                "base_ms": 100,
                "max_ms": 1000,
                "jitter": False,
            }
        )
        client = Client(config)
        assert client is not None
        assert isinstance(client, Client)

    def test_client_requires_api_key(self):
        """Test that client requires API key"""
        with pytest.raises(ValueError, match="API key cannot be empty"):
            Client(api_key="")

    def test_client_from_environment(self):
        """Test creating client from environment variable"""
        with patch.dict(os.environ, {"C2_API_KEY": "env-api-key"}):
            client = Client(api_key=os.environ["C2_API_KEY"])
            assert client is not None


class TestErrorTypes:
    """Test cases for error types"""

    def test_validation_error(self):
        """Test ValidationError properties"""
        error = ValidationError(
            "Test validation error",
            request_id="test-123",
            hint="Test hint"
        )
        
        assert error.code == "VALIDATION_ERROR"
        assert error.status_code == 422
        assert error.request_id == "test-123"
        assert error.hint == "Test hint"
        assert "422" in error.get_summary()
        assert "Check required fields" in error.get_next_steps()

    def test_auth_error(self):
        """Test AuthError properties"""
        error = AuthError(
            "Test auth error",
            request_id="test-456",
            endpoint="/verify/asset"
        )
        
        assert error.code == "AUTH_ERROR"
        assert error.status_code == 401
        assert error.request_id == "test-456"
        assert error.endpoint == "/verify/asset"
        assert "401" in error.get_summary()
        assert "Verify your API key" in error.get_next_steps()

    def test_rate_limit_error(self):
        """Test RateLimitError properties"""
        error = RateLimitError(
            "Rate limit exceeded",
            request_id="test-789",
            retry_after=60,
            attempt_count=3
        )
        
        assert error.code == "RATE_LIMIT_ERROR"
        assert error.status_code == 429
        assert error.retry_after == 60
        assert error.attempt_count == 3
        assert "429" in error.get_summary()
        assert "Wait 60 seconds" in error.get_next_steps()


class TestConfiguration:
    """Test cases for configuration validation"""

    def test_client_config_validation(self):
        """Test ClientConfig validation"""
        # Valid config
        config = ClientConfig(api_key="test-key")
        assert config.api_key == "test-key"
        assert config.base_url == "https://api.credlink.com/v1"
        assert config.timeout_ms == 30000

    def test_retry_config_defaults(self):
        """Test RetryConfig default values"""
        from credlink.types import RetryConfig
        
        config = RetryConfig()
        assert config.max_attempts == 5
        assert config.base_ms == 250
        assert config.max_ms == 5000
        assert config.jitter is True

    def test_telemetry_config_defaults(self):
        """Test TelemetryConfig default values"""
        from credlink.types import TelemetryConfig
        
        config = TelemetryConfig()
        assert config.enabled is False
        assert config.otel is None
