"""
Transport layer for the CredLink SDK
Handles HTTP communication, retries, circuit breaker, and telemetry
"""

import asyncio
import random
import time
import uuid
from typing import Any, AsyncIterable, Dict, Optional, Callable, Union
from datetime import datetime, timedelta

import httpx

from .types import (
    ClientConfig,
    RequestOptions,
    CredLinkError,
    AuthError,
    RateLimitError,
    ConflictError,
    ValidationError,
    ServerError,
    NetworkError,
    RetryConfig,
)


# ============================================================================
# Circuit Breaker Implementation
# ============================================================================

class CircuitBreakerState:
    """State of the circuit breaker"""
    def __init__(self):
        self.state: str = "closed"  # closed, open, half_open
        self.failure_count: int = 0
        self.last_failure_time: Optional[float] = None
        self.next_attempt_time: Optional[float] = None


class CircuitBreaker:
    """Circuit breaker to prevent cascading failures"""
    
    def __init__(self, name: str, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = 3
        self.half_open_calls = 0
        self.state = CircuitBreakerState()
    
    async def execute(self, operation: Callable[[], Any]) -> Any:
        """Execute operation with circuit breaker protection"""
        if self.state.state == "open":
            if time.time() < (self.state.next_attempt_time or 0):
                raise NetworkError(
                    f"Circuit breaker '{self.name}' is open",
                    hint="Service is temporarily unavailable. Please retry later."
                )
            self._set_state("half_open")
            self.half_open_calls = 0
        
        try:
            result = await operation()
            self._on_success()
            return result
        except Exception as error:
            self._on_failure()
            raise error
    
    def _on_success(self):
        """Handle successful operation"""
        if self.state.state == "half_open":
            self.half_open_calls += 1
            if self.half_open_calls >= self.half_open_max_calls:
                self._set_state("closed")
        else:
            self._set_state("closed")
    
    def _on_failure(self):
        """Handle failed operation"""
        self.state.failure_count += 1
        self.state.last_failure_time = time.time()
        
        if self.state.state == "half_open":
            self._set_state("open")
        elif self.state.failure_count >= self.failure_threshold:
            self._set_state("open")
    
    def _set_state(self, new_state: str):
        """Set circuit breaker state"""
        self.state.state = new_state
        
        if new_state == "open":
            self.state.next_attempt_time = time.time() + self.recovery_timeout
        elif new_state == "closed":
            self.state.failure_count = 0
            self.half_open_calls = 0
    
    def get_state(self) -> str:
        """Get current circuit breaker state"""
        return self.state.state


# ============================================================================
# Retry Logic with Jittered Exponential Backoff
# ============================================================================

class RetryHandler:
    """Handles retry logic with exponential backoff"""
    
    def __init__(self, config: RetryConfig):
        self.config = config
    
    async def execute_with_retry(
        self,
        operation: Callable[[], Any],
        is_retryable: Callable[[Exception], bool],
        context: str
    ) -> Any:
        """Execute operation with retry logic"""
        max_attempts = self.config.max_attempts
        last_error: Optional[Exception] = None
        
        for attempt in range(max_attempts + 1):
            try:
                if attempt > 0:
                    delay = self._calculate_delay(attempt)
                    await asyncio.sleep(delay)
                
                return await operation()
            except Exception as error:
                last_error = error
                
                if attempt == max_attempts or not is_retryable(error):
                    break
                
                # Add attempt count to error if it's a RateLimitError
                if isinstance(error, RateLimitError):
                    error.attempt_count = attempt + 1
        
        raise last_error
    
    def _calculate_delay(self, attempt: int) -> float:
        """Calculate delay for retry attempt"""
        base_ms = self.config.base_ms
        max_ms = self.config.max_ms
        jitter = self.config.jitter
        
        # Exponential backoff: base * 2^(attempt-1)
        exponential_delay = base_ms * (2 ** (attempt - 1)) / 1000  # Convert to seconds
        
        if jitter:
            # Full jitter: random between 0 and exponentialDelay
            delay = min(random.random() * exponential_delay, max_ms / 1000)
        else:
            delay = min(exponential_delay, max_ms / 1000)
        
        return delay


# ============================================================================
# Telemetry Manager
# ============================================================================

class TelemetryManager:
    """Manages OpenTelemetry telemetry (optional)"""
    
    def __init__(self, config: Optional[ClientConfig.TelemetryConfig] = None):
        self.enabled = config is not None and config.enabled
        self.otel_config = config.otel if config else None
        
        if self.enabled:
            self._initialize_opentelemetry()
    
    def _initialize_opentelemetry(self):
        """Initialize OpenTelemetry if available"""
        try:
            from opentelemetry import trace
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            
            # Set up tracer provider
            trace.set_tracer_provider(TracerProvider())
            tracer_provider = trace.get_tracer_provider()
            
            # Set up OTLP exporter
            otlp_exporter = OTLPSpanExporter()
            span_processor = BatchSpanProcessor(otlp_exporter)
            tracer_provider.add_span_processor(span_processor)
            
            self.tracer = trace.get_tracer(
                self.otel_config.get("service_name", "credlink-sdk"),
                self.otel_config.get("service_version", "1.3.0")
            )
            
            print("CredLink SDK: OpenTelemetry enabled")
        except ImportError:
            print("CredLink SDK: OpenTelemetry packages not installed, telemetry disabled")
            self.enabled = False
        except Exception as e:
            print(f"CredLink SDK: Failed to initialize OpenTelemetry: {e}")
            self.enabled = False
    
    def create_span(self, name: str, attributes: Optional[Dict[str, Any]] = None):
        """Create a span for tracing"""
        if not self.enabled or not hasattr(self, 'tracer'):
            return None
        
        span = self.tracer.start_span(name)
        if attributes:
            for key, value in attributes.items():
                span.set_attribute(key, value)
        return span
    
    def record_metric(self, name: str, value: float, attributes: Optional[Dict[str, Any]] = None):
        """Record a metric"""
        if not self.enabled:
            return
        
        # In a full implementation, this would use OpenTelemetry metrics
        print(f"Metric: {name} = {value}", attributes)
    
    def is_enabled(self) -> bool:
        """Check if telemetry is enabled"""
        return self.enabled


# ============================================================================
# HTTP Transport Implementation
# ============================================================================

class HttpTransport:
    """HTTP transport layer with retry and circuit breaker"""
    
    DEFAULT_CONFIG = {
        "base_url": "https://api.credlink.com/v1",
        "timeout_ms": 30000,
        "retries": {
            "max_attempts": 5,
            "base_ms": 250,
            "max_ms": 5000,
            "jitter": True,
        },
        "user_agent": "credlink-sdk/python/1.3.0",
    }
    
    def __init__(self, config: ClientConfig):
        self.config = self._merge_config(config)
        self.circuit_breaker = CircuitBreaker("http-transport")
        self.retry_handler = RetryHandler(self.config.retries)
        self.telemetry = TelemetryManager(config.telemetry)
        
        # Initialize HTTP client with SSL verification enforced
        self.client = httpx.AsyncClient(
            base_url=self.config.base_url,
            timeout=self.config.timeout_ms / 1000,  # Convert to seconds
            verify=True,  # Explicitly enforce SSL certificate verification
            headers={
                "User-Agent": self.config.user_agent,
                "X-API-Key": self.config.api_key,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )
    
    def _merge_config(self, config: ClientConfig) -> ClientConfig:
        """Merge user config with defaults"""
        merged = self.DEFAULT_CONFIG.copy()
        merged.update(config.dict(exclude_unset=True) if hasattr(config, 'dict') else config)
        
        # Merge nested retry config
        if config.retries:
            retry_defaults = self.DEFAULT_CONFIG["retries"].copy()
            retry_defaults.update(config.retries.dict(exclude_unset=True) if hasattr(config.retries, 'dict') else config.retries)
            merged["retries"] = RetryConfig(**retry_defaults)
        else:
            merged["retries"] = RetryConfig(**self.DEFAULT_CONFIG["retries"])
        
        return ClientConfig(**merged)
    
    async def request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        options: Optional[RequestOptions] = None
    ) -> Dict[str, Any]:
        """Make HTTP request with retry and circuit breaker"""
        request_id = self._generate_request_id()
        idempotency_key = options.idempotency_key if options else None
        
        headers = {
            "X-Request-ID": request_id,
        }
        
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        
        if options and options.headers:
            headers.update(options.headers)
        
        timeout = options.timeout if options else self.config.timeout_ms
        
        is_retryable = self._create_retry_predicate(method)
        
        return await self.circuit_breaker.execute(
            lambda: self.retry_handler.execute_with_retry(
                lambda: self._make_request(method, path, data, headers, timeout, request_id),
                is_retryable,
                f"{method} {path}"
            )
        )
    
    async def request_stream(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        options: Optional[RequestOptions] = None
    ) -> AsyncIterable[Dict[str, Any]]:
        """Make streaming HTTP request"""
        request_id = self._generate_request_id()
        idempotency_key = options.idempotency_key if options else None
        
        headers = {
            "X-Request-ID": request_id,
            "Accept": "application/json",
        }
        
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        
        if options and options.headers:
            headers.update(options.headers)
        
        timeout = options.timeout if options else self.config.timeout_ms
        
        is_retryable = self._create_retry_predicate(method)
        
        async def make_stream_request():
            response = await self.client.stream(
                method,
                path,
                json=data,
                headers=headers,
                timeout=timeout / 1000
            )
            
            if response.status_code >= 400:
                await self._handle_http_error(response, request_id, path, idempotency_key)
            
            return response
        
        response = await self.circuit_breaker.execute(
            lambda: self.retry_handler.execute_with_retry(
                make_stream_request,
                is_retryable,
                f"{method} {path} (stream)"
            )
        )
        
        # Return async iterator for streaming response
        return self._create_async_iterator(response)
    
    async def _make_request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]],
        headers: Dict[str, str],
        timeout: int,
        request_id: str
    ) -> Dict[str, Any]:
        """Make actual HTTP request"""
        response = await self.client.request(
            method,
            path,
            json=data,
            headers=headers,
            timeout=timeout / 1000
        )
        
        if response.status_code >= 400:
            await self._handle_http_error(response, request_id, path, headers.get("Idempotency-Key"))
        
        return response.json()
    
    async def _create_async_iterator(self, response: httpx.Response) -> AsyncIterable[Dict[str, Any]]:
        """Create async iterator for streaming response"""
        async def iterator():
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        continue  # Skip malformed JSON lines
        
        return iterator()
    
    async def _handle_http_error(
        self,
        response: httpx.Response,
        request_id: str,
        path: str,
        idempotency_key: Optional[str] = None
    ) -> None:
        """Handle HTTP error responses"""
        try:
            error_data = response.json()
        except:
            error_data = {}
        
        message = error_data.get("detail", error_data.get("message", f"HTTP {response.status_code}"))
        retry_after = response.headers.get("Retry-After")
        retry_after_seconds = int(retry_after) if retry_after else None
        
        if response.status_code == 401:
            raise AuthError(
                message,
                request_id=request_id,
                endpoint=path,
                hint=error_data.get("hint")
            )
        elif response.status_code == 403:
            raise AuthError(
                message,
                request_id=request_id,
                endpoint=path,
                hint=error_data.get("hint", "Insufficient permissions for this operation")
            )
        elif response.status_code == 409:
            raise ConflictError(
                message,
                request_id=request_id,
                idempotency_key=idempotency_key,
                endpoint=path,
                hint=error_data.get("hint")
            )
        elif response.status_code == 422:
            raise ValidationError(
                message,
                request_id=request_id,
                endpoint=path,
                hint=error_data.get("hint")
            )
        elif response.status_code == 429:
            raise RateLimitError(
                message,
                request_id=request_id,
                endpoint=path,
                retry_after=retry_after_seconds,
                hint=error_data.get("hint")
            )
        elif response.status_code in [500, 502, 503, 504]:
            raise ServerError(
                message,
                request_id=request_id,
                endpoint=path,
                hint=error_data.get("hint")
            )
        else:
            raise NetworkError(
                f"HTTP {response.status_code}: {message}",
                request_id=request_id,
                endpoint=path,
                hint=error_data.get("hint")
            )
    
    def _create_retry_predicate(self, method: str) -> Callable[[Exception], bool]:
        """Create predicate to determine if error is retryable"""
        def is_retryable(error: Exception) -> bool:
            # Don't retry validation errors, auth errors, or conflicts
            if isinstance(error, (ValidationError, AuthError, ConflictError)):
                return False
            
            # Retry rate limit errors, server errors, and network errors
            if isinstance(error, (RateLimitError, ServerError, NetworkError)):
                return True
            
            # Retry specific HTTP status codes
            if hasattr(error, 'status_code'):
                return error.status_code in [408, 429, 500, 502, 503, 504]
            
            # Retry network-related errors
            if hasattr(error, 'code'):
                return error.code in ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT']
            
            return False
        
        return is_retryable
    
    def _generate_request_id(self) -> str:
        """Generate unique request ID"""
        return f"req_{int(time.time())}_{random.randint(1000, 9999)}"
    
    def get_circuit_breaker_state(self) -> str:
        """Get current circuit breaker state"""
        return self.circuit_breaker.get_state()
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()


# Import json for streaming response
import json
