package credlink

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

// ============================================================================
// HTTP Transport Implementation
// ============================================================================

// Transport handles HTTP communication with retry and circuit breaker
type Transport struct {
	config           *Config
	httpClient       *http.Client
	circuitBreaker   *CircuitBreaker
	telemetryEnabled bool
}

// NewTransport creates a new HTTP transport
func NewTransport(config *Config) *Transport {
	if err := config.Validate(); err != nil {
		panic(err)
	}

	transport := &Transport{
		config: config,
		httpClient: &http.Client{
			Timeout: config.TimeoutMs,
		},
		circuitBreaker: NewCircuitBreaker("http-transport"),
	}

	if config.Telemetry != nil {
		transport.telemetryEnabled = config.Telemetry.Enabled
	}

	return transport
}

// Request makes an HTTP request with retry and circuit breaker
func (t *Transport) Request(ctx context.Context, method, path string, body interface{}, options *RequestOptions) (*http.Response, error) {
	requestID := t.generateRequestID()
	idempotencyKey := options.IdempotencyKey
	if idempotencyKey == "" {
		idempotencyKey = t.generateIdempotencyKey()
	}

	var bodyReader io.Reader
	if body != nil {
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, t.config.BaseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", t.config.UserAgent)
	req.Header.Set("X-API-Key", t.config.APIKey)
	req.Header.Set("X-Request-ID", requestID)
	
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}

	// Add custom headers
	if options.Headers != nil {
		for key, value := range options.Headers {
			req.Header.Set(key, value)
		}
	}

	// Override timeout if specified
	timeout := t.config.TimeoutMs
	if options.Timeout > 0 {
		timeout = options.Timeout
	}

	// Create a new HTTP client with the specified timeout
	client := &http.Client{
		Timeout: timeout,
	}

	isRetryable := t.createRetryPredicate(method)

	var result *http.Response
	var lastErr error

	_, err = t.circuitBreaker.Execute(func() (interface{}, error) {
		return nil, t.executeWithRetry(client, req, isRetryable, func(resp *http.Response, err error) error {
			if err != nil {
				lastErr = err
				return err
			}
			
			if resp.StatusCode >= 400 {
				lastErr = t.handleHTTPError(resp, requestID, path, idempotencyKey)
				return lastErr
			}
			
			result = resp
			return nil
		})
	})

	if err != nil {
		return nil, lastErr
	}

	return result, nil
}

// RequestStream makes a streaming HTTP request
func (t *Transport) RequestStream(ctx context.Context, method, path string, body interface{}, options *RequestOptions) (<-chan map[string]interface{}, error) {
	resp, err := t.Request(ctx, method, path, body, options)
	if err != nil {
		return nil, err
	}

	ch := make(chan map[string]interface{}, 10) // Buffered channel

	go func() {
		defer resp.Body.Close()
		defer close(ch)

		decoder := json.NewDecoder(resp.Body)
		
		for {
			var item map[string]interface{}
			if err := decoder.Decode(&item); err != nil {
				if err == io.EOF {
					break
				}
				// Skip malformed JSON and continue
				continue
			}
			ch <- item
		}
	}()

	return ch, nil
}

// executeWithRetry executes request with retry logic
func (t *Transport) executeWithRetry(client *http.Client, req *http.Request, isRetryable func(error) bool, callback func(*http.Response, error) error) error {
	maxAttempts := t.config.Retries.MaxAttempts
	var lastErr error

	for attempt := 0; attempt <= maxAttempts; attempt++ {
		if attempt > 0 {
			delay := t.calculateDelay(attempt)
			select {
			case <-req.Context().Done():
				return req.Context().Err()
			case <-time.After(delay):
			}
		}

		resp, err := client.Do(req)
		if callbackErr := callback(resp, err); callbackErr != nil {
			lastErr = callbackErr
			
			if attempt == maxAttempts || !isRetryable(lastErr) {
				return lastErr
			}
			
			// Add attempt count to error if it's a RateLimitError
			if rateLimitErr, ok := lastErr.(*RateLimitError); ok {
				attemptCount := attempt + 1
				rateLimitErr.AttemptCount = &attemptCount
			}
			
			continue
		}
		
		return nil
	}

	return lastErr
}

// calculateDelay calculates delay for retry attempt with jitter
func (t *Transport) calculateDelay(attempt int) time.Duration {
	baseMs := t.config.Retries.BaseMs
	maxMs := t.config.Retries.MaxMs
	jitter := t.config.Retries.Jitter

	// Exponential backoff: base * 2^(attempt-1)
	exponentialDelay := time.Duration(float64(baseMs) * math.Pow(2, float64(attempt-1)))
	
	if jitter {
		// Full jitter: random between 0 and exponentialDelay
		delay := time.Duration(rand.Float64() * float64(exponentialDelay))
		if delay > maxMs {
			delay = maxMs
		}
		return delay
	}
	
	if exponentialDelay > maxMs {
		exponentialDelay = maxMs
	}
	
	return exponentialDelay
}

// createRetryPredicate creates a function to determine if error is retryable
func (t *Transport) createRetryPredicate(method string) func(error) bool {
	return func(err error) bool {
		// Don't retry validation errors, auth errors, or conflicts
		switch err.(type) {
		case *ValidationError, *AuthError, *ConflictError:
			return false
		}

		// Retry rate limit errors, server errors, and network errors
		switch err.(type) {
		case *RateLimitError, *ServerError, *NetworkError:
			return true
		}

		// Check for specific HTTP status codes
		if httpErr, ok := err.(interface{ StatusCode() int }); ok {
			status := httpErr.StatusCode()
			return status == 408 || status == 429 || status == 500 || status == 502 || status == 503 || status == 504
		}

		return false
	}
}

// handleHTTPError handles HTTP error responses
func (t *Transport) handleHTTPError(resp *http.Response, requestID, path, idempotencyKey string) error {
	defer resp.Body.Close()

	var errorData map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&errorData); err != nil {
		errorData = make(map[string]interface{})
	}

	message, _ := errorData["detail"].(string)
	if message == "" {
		if msg, ok := errorData["message"].(string); ok {
			message = msg
		} else {
			message = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
	}

	hint, _ := errorData["hint"].(string)
	retryAfterHeader := resp.Header.Get("Retry-After")
	var retryAfter *int
	if retryAfterHeader != "" {
		if seconds, err := strconv.Atoi(retryAfterHeader); err == nil {
			retryAfter = &seconds
		}
	}

	switch resp.StatusCode {
	case 401:
		err := NewAuthError(message)
		err.requestID = requestID
		err.endpoint = path
		err.hint = hint
		if err.hint == "" {
			err.hint = "Check your API key in the X-API-Key header"
		}
		return err

	case 403:
		err := NewAuthError(message)
		err.requestID = requestID
		err.endpoint = path
		err.hint = hint
		if err.hint == "" {
			err.hint = "Insufficient permissions for this operation"
		}
		return err

	case 409:
		err := NewConflictError(message)
		err.requestID = requestID
		err.idempotencyKey = idempotencyKey
		err.endpoint = path
		err.hint = hint
		return err

	case 422:
		err := NewValidationError(message)
		err.requestID = requestID
		err.endpoint = path
		err.hint = hint
		return err

	case 429:
		err := NewRateLimitError(message, retryAfter)
		err.requestID = requestID
		err.endpoint = path
		err.hint = hint
		return err

	case 500, 502, 503, 504:
		err := NewServerError(message)
		err.requestID = requestID
		err.endpoint = path
		err.hint = hint
		return err

	default:
		err := NewNetworkError(fmt.Sprintf("HTTP %d: %s", resp.StatusCode, message))
		err.requestID = requestID
		err.endpoint = path
		err.hint = hint
		return err
	}
}

// generateRequestID generates a unique request ID
func (t *Transport) generateRequestID() string {
	return fmt.Sprintf("req_%d_%d", time.Now().Unix(), rand.Intn(10000))
}

// generateIdempotencyKey generates a unique idempotency key
func (t *Transport) generateIdempotencyKey() string {
	return uuid.New().String()
}

// GetCircuitBreakerState returns the current circuit breaker state
func (t *Transport) GetCircuitBreakerState() string {
	return t.circuitBreaker.GetState()
}

// Close closes the HTTP client and cleans up resources
func (t *Transport) Close() {
	// HTTP client doesn't need explicit closing in Go
	// This method is for consistency with other language SDKs
}

// ============================================================================
// Telemetry Manager (simplified for Go)
// ============================================================================

// TelemetryManager manages telemetry (placeholder implementation)
type TelemetryManager struct {
	enabled bool
	config  *TelemetryConfig
}

// NewTelemetryManager creates a new telemetry manager
func NewTelemetryManager(config *TelemetryConfig) *TelemetryManager {
	enabled := config != nil && config.Enabled
	return &TelemetryManager{
		enabled: enabled,
		config:  config,
	}
}

// CreateSpan creates a span for tracing (placeholder)
func (tm *TelemetryManager) CreateSpan(name string, attributes map[string]interface{}) *Span {
	if !tm.enabled {
		return &Span{enabled: false}
	}
	return &Span{
		enabled:   true,
		name:      name,
		attributes: attributes,
		startTime: time.Now(),
	}
}

// RecordMetric records a metric (placeholder)
func (tm *TelemetryManager) RecordMetric(name string, value float64, attributes map[string]interface{}) {
	if !tm.enabled {
		return
	}
	// In a full implementation, this would use OpenTelemetry metrics
	fmt.Printf("Metric: %s = %f %v\n", name, value, attributes)
}

// IsEnabled returns whether telemetry is enabled
func (tm *TelemetryManager) IsEnabled() bool {
	return tm.enabled
}

// Span represents a tracing span (placeholder implementation)
type Span struct {
	enabled    bool
	name       string
	attributes map[string]interface{}
	startTime  time.Time
}

// SetAttribute sets an attribute on the span
func (s *Span) SetAttribute(key string, value interface{}) {
	if !s.enabled {
		return
	}
	if s.attributes == nil {
		s.attributes = make(map[string]interface{})
	}
	s.attributes[key] = value
}

// End ends the span
func (s *Span) End() {
	if !s.enabled {
		return
	}
	duration := time.Since(s.startTime)
	fmt.Printf("Span: %s completed in %v\n", s.name, duration)
}

// ============================================================================
// Request Options
// ============================================================================

// RequestOptions defines options for individual requests
type RequestOptions struct {
	Timeout          time.Duration
	IdempotencyKey   string
	Headers          map[string]string
	Retries          *RetryConfig
}

// NewRequestOptions creates new request options with defaults
func NewRequestOptions() *RequestOptions {
	return &RequestOptions{
		Headers: make(map[string]string),
	}
}

// WithTimeout sets the timeout for the request
func (ro *RequestOptions) WithTimeout(timeout time.Duration) *RequestOptions {
	ro.Timeout = timeout
	return ro
}

// WithIdempotencyKey sets the idempotency key for the request
func (ro *RequestOptions) WithIdempotencyKey(key string) *RequestOptions {
	ro.IdempotencyKey = key
	return ro
}

// WithHeader adds a header to the request
func (ro *RequestOptions) WithHeader(key, value string) *RequestOptions {
	if ro.Headers == nil {
		ro.Headers = make(map[string]string)
	}
	ro.Headers[key] = value
	return ro
}

// WithRetries sets retry configuration for the request
func (ro *RequestOptions) WithRetries(retries *RetryConfig) *RequestOptions {
	ro.Retries = retries
	return ro
}
