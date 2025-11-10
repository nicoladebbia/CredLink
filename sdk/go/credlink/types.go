package credlink

import (
	"fmt"
	"strings"
	"time"
)

// Version information
const (
	Version    = "2.0.0"
	UserAgent  = "credlink-sdk/go/" + Version
	DefaultURL = "https://api.credlink.com/v1"
)

// ============================================================================
// Configuration Types
// ============================================================================

// RetryConfig defines retry behavior
type RetryConfig struct {
	MaxAttempts int           `json:"max_attempts"`
	BaseMs      time.Duration `json:"base_ms"`
	MaxMs       time.Duration `json:"max_ms"`
	Jitter      bool          `json:"jitter"`
}

// DefaultRetryConfig returns default retry configuration
func DefaultRetryConfig() *RetryConfig {
	return &RetryConfig{
		MaxAttempts: 5,
		BaseMs:      250 * time.Millisecond,
		MaxMs:       5 * time.Second,
		Jitter:      true,
	}
}

// TelemetryConfig defines telemetry settings
type TelemetryConfig struct {
	Enabled bool            `json:"enabled"`
	OTel    map[string]string `json:"otel,omitempty"`
}

// Config defines client configuration
type Config struct {
	APIKey     string            `json:"api_key"`
	BaseURL    string            `json:"base_url"`
	TimeoutMs  time.Duration     `json:"timeout_ms"`
	Telemetry  *TelemetryConfig  `json:"telemetry,omitempty"`
	Retries    *RetryConfig      `json:"retries,omitempty"`
	UserAgent  string            `json:"user_agent,omitempty"`
}

// DefaultConfig returns default configuration
func DefaultConfig() *Config {
	return &Config{
		BaseURL:   DefaultURL,
		TimeoutMs: 30 * time.Second,
		Retries:   DefaultRetryConfig(),
		UserAgent: UserAgent,
	}
}

// Validate validates the configuration
func (c *Config) Validate() error {
	if strings.TrimSpace(c.APIKey) == "" {
		return fmt.Errorf("API key is required")
	}
	if c.BaseURL == "" {
		c.BaseURL = DefaultURL
	}
	if c.TimeoutMs == 0 {
		c.TimeoutMs = 30 * time.Second
	}
	if c.Retries == nil {
		c.Retries = DefaultRetryConfig()
	}
	if c.UserAgent == "" {
		c.UserAgent = UserAgent
	}
	return nil
}

// ============================================================================
// Error Types
// ============================================================================

// Error is the base interface for all CredLink errors
type Error interface {
	error
	Code() string
	StatusCode() int
	RequestID() string
	IdempotencyKey() string
	Endpoint() string
	Hint() string
	DocsURL() string
	Timestamp() time.Time
	Summary() string
	NextSteps() []string
}

// BaseError implements the Error interface
type BaseError struct {
	message         string
	code            string
	statusCode      int
	requestID       string
	idempotencyKey  string
	endpoint        string
	hint            string
	docsURL         string
	timestamp       time.Time
}

// NewBaseError creates a new base error
func NewBaseError(message, code string, statusCode int) *BaseError {
	return &BaseError{
		message:    message,
		code:       code,
		statusCode: statusCode,
		timestamp:  time.Now().UTC(),
		docsURL:    "https://docs.credlink.com/api/errors#" + strings.ToLower(code),
	}
}

// Error implements the error interface
func (e *BaseError) Error() string {
	return e.message
}

// Code returns the error code
func (e *BaseError) Code() string {
	return e.code
}

// StatusCode returns the HTTP status code
func (e *BaseError) StatusCode() int {
	return e.statusCode
}

// RequestID returns the request ID
func (e *BaseError) RequestID() string {
	return e.requestID
}

// IdempotencyKey returns the idempotency key
func (e *BaseError) IdempotencyKey() string {
	return e.idempotencyKey
}

// Endpoint returns the endpoint
func (e *BaseError) Endpoint() string {
	return e.endpoint
}

// Hint returns the hint
func (e *BaseError) Hint() string {
	return e.hint
}

// DocsURL returns the documentation URL
func (e *BaseError) DocsURL() string {
	return e.docsURL
}

// Timestamp returns when the error occurred
func (e *BaseError) Timestamp() time.Time {
	return e.timestamp
}

// Summary returns a search-engine friendly summary
func (e *BaseError) Summary() string {
	return fmt.Sprintf("C2C %s: %d - %s", e.code, e.statusCode, e.message)
}

// NextSteps returns actionable next steps
func (e *BaseError) NextSteps() []string {
	return []string{
		"Check the API documentation",
		"Contact support if the issue persists",
	}
}

// AuthError represents authentication errors (401/403)
type AuthError struct {
	*BaseError
}

// NewAuthError creates a new authentication error
func NewAuthError(message string) *AuthError {
	err := NewBaseError(message, "AUTH_ERROR", 401)
	err.hint = "Check your API key in the X-API-Key header"
	return &AuthError{BaseError: err}
}

// NextSteps returns authentication-specific next steps
func (e *AuthError) NextSteps() []string {
	return []string{
		"Verify your API key is correct",
		"Check the X-API-Key header format",
		"Ensure your API key is active and not expired",
		"Contact support if the issue persists",
	}
}

// RateLimitError represents rate limit errors (429)
type RateLimitError struct {
	*BaseError
	RetryAfter   *int
	AttemptCount *int
}

// NewRateLimitError creates a new rate limit error
func NewRateLimitError(message string, retryAfter *int) *RateLimitError {
	err := NewBaseError(message, "RATE_LIMIT_ERROR", 429)
	err.hint = "Wait before retrying or implement exponential backoff"
	return &RateLimitError{
		BaseError:  err,
		RetryAfter: retryAfter,
	}
}

// Summary returns rate limit-specific summary
func (e *RateLimitError) Summary() string {
	retryInfo := ""
	if e.RetryAfter != nil {
		retryInfo = fmt.Sprintf(" (Retry-After=%ds)", *e.RetryAfter)
	}
	return fmt.Sprintf("C2C RateLimitError: 429%s - %s", retryInfo, e.message)
}

// NextSteps returns rate limit-specific next steps
func (e *RateLimitError) NextSteps() []string {
	steps := []string{
		"Implement exponential backoff with jitter",
		"Honor the Retry-After header if provided",
		"Consider reducing request frequency",
	}
	
	if e.RetryAfter != nil {
		steps = append(steps, fmt.Sprintf("Wait %d seconds before retrying", *e.RetryAfter))
	}
	
	steps = append(steps, "Contact support for rate limit increases")
	return steps
}

// ConflictError represents conflict errors (409)
type ConflictError struct {
	*BaseError
}

// NewConflictError creates a new conflict error
func NewConflictError(message string) *ConflictError {
	err := NewBaseError(message, "CONFLICT_ERROR", 409)
	err.hint = "Use a different idempotency key or check resource state"
	return &ConflictError{BaseError: err}
}

// Summary returns conflict-specific summary
func (e *ConflictError) Summary() string {
	keyInfo := ""
	if e.idempotencyKey != "" {
		keyInfo = fmt.Sprintf(" (key=%s)", e.idempotencyKey)
	}
	return fmt.Sprintf("C2C ConflictError: 409%s - %s", keyInfo, e.message)
}

// NextSteps returns conflict-specific next steps
func (e *ConflictError) NextSteps() []string {
	return []string{
		"Use a different idempotency key for new requests",
		"Check current resource state before retrying",
		"Verify request body matches idempotency key",
		"Consider using a different resource identifier",
	}
}

// ValidationError represents validation errors (422)
type ValidationError struct {
	*BaseError
}

// NewValidationError creates a new validation error
func NewValidationError(message string) *ValidationError {
	err := NewBaseError(message, "VALIDATION_ERROR", 422)
	err.hint = "Check required fields and data formats"
	return &ValidationError{BaseError: err}
}

// NextSteps returns validation-specific next steps
func (e *ValidationError) NextSteps() []string {
	return []string{
		"Check that all required fields are provided",
		"Verify data types and formats match the schema",
		"Check parameter constraints (min/max values)",
		"Review API documentation for request format",
	}
}

// ServerError represents server errors (5xx)
type ServerError struct {
	*BaseError
}

// NewServerError creates a new server error
func NewServerError(message string) *ServerError {
	err := NewBaseError(message, "SERVER_ERROR", 500)
	err.hint = "Server encountered an unexpected error"
	return &ServerError{BaseError: err}
}

// NextSteps returns server error-specific next steps
func (e *ServerError) NextSteps() []string {
	return []string{
		"Retry the request with exponential backoff",
		"Check service status page for outages",
		"Contact support if the issue persists",
		"Consider implementing circuit breaker pattern",
	}
}

// NetworkError represents network errors
type NetworkError struct {
	*BaseError
}

// NewNetworkError creates a new network error
func NewNetworkError(message string) *NetworkError {
	err := NewBaseError(message, "NETWORK_ERROR", 0)
	err.hint = "Network connectivity issue encountered"
	return &NetworkError{BaseError: err}
}

// NextSteps returns network error-specific next steps
func (e *NetworkError) NextSteps() []string {
	return []string{
		"Check network connectivity",
		"Verify firewall and proxy settings",
		"Retry with exponential backoff",
		"Check DNS resolution for API endpoint",
	}
}

// ============================================================================
// API Request/Response Types
// ============================================================================

// VerificationResult represents the result of asset verification
type VerificationResult struct {
	Verified        bool      `json:"verified"`
	ManifestURL     *string   `json:"manifest_url,omitempty"`
	TrustRoots      []string  `json:"trust_roots,omitempty"`
	PolicyVersion   *string   `json:"policy_version,omitempty"`
	VerificationTime *string  `json:"verification_time,omitempty"`
	Cached          bool      `json:"cached"`
}

// VerifyAssetRequest represents a request to verify an asset
type VerifyAssetRequest struct {
	AssetURL              *string  `json:"asset_url,omitempty"`
	AssetBuffer           *string  `json:"asset_buffer,omitempty"`
	ContentType           *string  `json:"content_type,omitempty"`
	PolicyID              string   `json:"policy_id"`
	Timeout               *int     `json:"timeout,omitempty"`
	CachedETag            *string  `json:"cached_etag,omitempty"`
	CachedCertThumbprints []string `json:"cached_cert_thumbprints,omitempty"`
	EnableDelta           bool     `json:"enable_delta"`
}

// VerifyAssetResponse represents the response from asset verification
type VerifyAssetResponse struct {
	Success   bool              `json:"success"`
	Data      VerificationResult `json:"data"`
	RequestID string            `json:"request_id"`
	Timestamp time.Time         `json:"timestamp"`
}

// AssetVerificationResult represents a single asset verification result
type AssetVerificationResult struct {
	URL         *string `json:"url"`
	Verified    bool    `json:"verified"`
	ManifestURL *string `json:"manifest_url,omitempty"`
	Error       *string `json:"error,omitempty"`
}

// VerifyPageRequest represents a request to verify a page
type VerifyPageRequest struct {
	PageURL     string `json:"page_url"`
	FollowLinks bool   `json:"follow_links"`
	MaxDepth    int    `json:"max_depth"`
	PolicyID    string `json:"policy_id"`
	Timeout     *int   `json:"timeout,omitempty"`
}

// VerifyPageResponse represents the response from page verification
type VerifyPageResponse struct {
	Success   bool                `json:"success"`
	Data      map[string]interface{} `json:"data"`
	RequestID string              `json:"request_id"`
	Timestamp time.Time           `json:"timestamp"`
}

// AssetReference represents a reference to an asset
type AssetReference struct {
	URL string  `json:"url"`
	ID  *string `json:"id,omitempty"`
}

// BatchVerifyRequest represents a request to verify multiple assets
type BatchVerifyRequest struct {
	Assets         []AssetReference `json:"assets"`
	PolicyID       string           `json:"policy_id"`
	Parallel       bool             `json:"parallel"`
	TimeoutPerAsset *int             `json:"timeout_per_asset,omitempty"`
}

// BatchVerifyResponse represents the response from batch verification
type BatchVerifyResponse struct {
	Success   bool                `json:"success"`
	Data      map[string]interface{} `json:"data"`
	RequestID string              `json:"request_id"`
	Timestamp time.Time           `json:"timestamp"`
}

// InjectLinkRequest represents a request to inject links
type InjectLinkRequest struct {
	HTML        string `json:"html"`
	ManifestURL string `json:"manifest_url"`
	Strategy    string `json:"strategy"`
	Selector    *string `json:"selector,omitempty"`
}

// InjectLinkResponse represents the response from link injection
type InjectLinkResponse struct {
	Success   bool                `json:"success"`
	Data      map[string]interface{} `json:"data"`
	RequestID string              `json:"request_id"`
	Timestamp time.Time           `json:"timestamp"`
}

// SignFolderRequest represents a request to sign a folder
type SignFolderRequest struct {
	FolderPath     string   `json:"folder_path"`
	ProfileID      string   `json:"profile_id"`
	TSA            bool     `json:"tsa"`
	Recursive      bool     `json:"recursive"`
	FilePatterns   []string `json:"file_patterns,omitempty"`
	IdempotencyKey string   `json:"idempotency_key"`
}

// SignFolderResponse represents the response from folder signing
type SignFolderResponse struct {
	Success   bool                `json:"success"`
	Data      map[string]interface{} `json:"data"`
	RequestID string              `json:"request_id"`
	Timestamp time.Time           `json:"timestamp"`
}

// ManifestRequest represents a request to store a manifest
type ManifestRequest struct {
	Content     *string               `json:"content,omitempty"`
	ContentType string                `json:"content_type"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// ManifestResponse represents the response from manifest operations
type ManifestResponse struct {
	Success   bool                `json:"success"`
	Data      map[string]interface{} `json:"data"`
	RequestID string              `json:"request_id"`
	Timestamp time.Time           `json:"timestamp"`
}

// JobStatus represents the status of a job
type JobStatus struct {
	JobID              string                 `json:"job_id"`
	Status             string                 `json:"status"`
	Progress           *float64               `json:"progress,omitempty"`
	Result             map[string]interface{} `json:"result,omitempty"`
	Error              map[string]interface{} `json:"error,omitempty"`
	CreatedAt          time.Time              `json:"created_at"`
	UpdatedAt          time.Time              `json:"updated_at"`
	EstimatedCompletion *time.Time             `json:"estimated_completion,omitempty"`
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

// CircuitBreakerState represents the state of a circuit breaker
type CircuitBreakerState struct {
	State             string
	FailureCount      int
	LastFailureTime   time.Time
	NextAttemptTime   time.Time
}

// CircuitBreaker prevents cascading failures
type CircuitBreaker struct {
	name              string
	state             CircuitBreakerState
	failureThreshold  int
	recoveryTimeout   time.Duration
	halfOpenMaxCalls  int
	halfOpenCalls     int
}

// NewCircuitBreaker creates a new circuit breaker
func NewCircuitBreaker(name string) *CircuitBreaker {
	return &CircuitBreaker{
		name:             name,
		failureThreshold: 5,
		recoveryTimeout:  60 * time.Second,
		halfOpenMaxCalls: 3,
		state: CircuitBreakerState{
			State: "closed",
		},
	}
}

// Execute executes an operation with circuit breaker protection
func (cb *CircuitBreaker) Execute(fn func() (interface{}, error)) (interface{}, error) {
	if cb.state.State == "open" {
		if time.Now().Before(cb.state.NextAttemptTime) {
			return nil, NewNetworkError(fmt.Sprintf("Circuit breaker '%s' is open", cb.name))
		}
		cb.setState("half-open")
		cb.halfOpenCalls = 0
	}

	result, err := fn()
	if err != nil {
		cb.onFailure()
		return nil, err
	}

	cb.onSuccess()
	return result, nil
}

func (cb *CircuitBreaker) onSuccess() {
	if cb.state.State == "half-open" {
		cb.halfOpenCalls++
		if cb.halfOpenCalls >= cb.halfOpenMaxCalls {
			cb.setState("closed")
		}
	} else {
		cb.setState("closed")
	}
}

func (cb *CircuitBreaker) onFailure() {
	cb.state.FailureCount++
	cb.state.LastFailureTime = time.Now()

	if cb.state.State == "half-open" {
		cb.setState("open")
	} else if cb.state.FailureCount >= cb.failureThreshold {
		cb.setState("open")
	}
}

func (cb *CircuitBreaker) setState(newState string) {
	cb.state.State = newState
	if newState == "open" {
		cb.state.NextAttemptTime = time.Now().Add(cb.recoveryTimeout)
	} else if newState == "closed" {
		cb.state.FailureCount = 0
		cb.halfOpenCalls = 0
	}
}

// GetState returns the current circuit breaker state
func (cb *CircuitBreaker) GetState() string {
	return cb.state.State
}
