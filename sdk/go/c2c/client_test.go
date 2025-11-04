package c2c

import (
	"testing"
	"time"
)

func TestClientCreation(t *testing.T) {
	// Test client creation with API key
	client := NewClientWithAPIKey("test-api-key")
	if client == nil {
		t.Fatal("Expected client to be created")
	}

	// Test client creation with config
	config := DefaultConfig()
	config.APIKey = "test-api-key"
	config.BaseURL = "https://test.api.com"
	config.TimeoutMs = 5 * time.Second
	
	client2 := NewClient(config)
	if client2 == nil {
		t.Fatal("Expected client to be created with config")
	}
}

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()
	
	if config.APIKey != "" {
		t.Errorf("Expected empty API key, got %s", config.APIKey)
	}
	
	if config.BaseURL != DefaultURL {
		t.Errorf("Expected base URL %s, got %s", DefaultURL, config.BaseURL)
	}
	
	if config.TimeoutMs != 30*time.Second {
		t.Errorf("Expected timeout 30s, got %v", config.TimeoutMs)
	}
}

func TestRetryConfig(t *testing.T) {
	config := DefaultRetryConfig()
	
	if config.MaxAttempts != 5 {
		t.Errorf("Expected max attempts 5, got %d", config.MaxAttempts)
	}
	
	if config.BaseMs != 250*time.Millisecond {
		t.Errorf("Expected base delay 250ms, got %v", config.BaseMs)
	}
	
	if config.MaxMs != 5*time.Second {
		t.Errorf("Expected max delay 5s, got %v", config.MaxMs)
	}
	
	if !config.Jitter {
		t.Error("Expected jitter to be enabled")
	}
}

func TestConfigValidation(t *testing.T) {
	// Test valid config
	config := &Config{
		APIKey:    "test-key",
		BaseURL:   "https://api.example.com",
		TimeoutMs: 30 * time.Second,
	}
	
	if err := config.Validate(); err != nil {
		t.Errorf("Expected valid config to pass validation: %v", err)
	}
	
	// Test missing API key
	config.APIKey = ""
	if err := config.Validate(); err == nil {
		t.Error("Expected validation to fail with missing API key")
	}
	
	// Test invalid URL
	config.APIKey = "test-key"
	config.BaseURL = "invalid-url"
	if err := config.Validate(); err == nil {
		t.Error("Expected validation to fail with invalid URL")
	}
}

func TestVersion(t *testing.T) {
	if Version == "" {
		t.Error("Expected version to be set")
	}
	
	expectedUserAgent := "c2c-sdk/go/" + Version
	if UserAgent != expectedUserAgent {
		t.Errorf("Expected user agent %s, got %s", expectedUserAgent, UserAgent)
	}
}

func TestPtr(t *testing.T) {
	// Test Ptr helper function
	str := "test"
	ptr := Ptr(&str)
	
	if ptr == nil {
		t.Error("Expected Ptr to return non-nil value")
	}
	
	if *ptr != str {
		t.Errorf("Expected %s, got %s", str, *ptr)
	}
	
	// Test with nil
	nilPtr := Ptr(nil)
	if nilPtr != nil {
		t.Error("Expected Ptr to return nil for nil input")
	}
}

func TestErrorTypes(t *testing.T) {
	// Test ValidationError
	err := &ValidationError{
		Message:   "Test validation error",
		RequestID: "test-123",
		Hint:      "Test hint",
	}
	
	if err.Code() != "VALIDATION_ERROR" {
		t.Errorf("Expected error code VALIDATION_ERROR, got %s", err.Code())
	}
	
	if err.StatusCode() != 422 {
		t.Errorf("Expected status code 422, got %d", err.StatusCode())
	}
	
	if err.RequestID() != "test-123" {
		t.Errorf("Expected request ID test-123, got %s", err.RequestID())
	}
	
	// Test AuthError
	authErr := &AuthError{
		Message:   "Test auth error",
		RequestID: "test-456",
		Endpoint:  "/verify/asset",
	}
	
	if authErr.Code() != "AUTH_ERROR" {
		t.Errorf("Expected error code AUTH_ERROR, got %s", authErr.Code())
	}
	
	if authErr.StatusCode() != 401 {
		t.Errorf("Expected status code 401, got %d", authErr.StatusCode())
	}
	
	// Test RateLimitError
	rateLimitErr := &RateLimitError{
		Message:      "Rate limit exceeded",
		RequestID:    "test-789",
		RetryAfter:   Ptr(60),
		AttemptCount: Ptr(3),
	}
	
	if rateLimitErr.Code() != "RATE_LIMIT_ERROR" {
		t.Errorf("Expected error code RATE_LIMIT_ERROR, got %s", rateLimitErr.Code())
	}
	
	if rateLimitErr.StatusCode() != 429 {
		t.Errorf("Expected status code 429, got %d", rateLimitErr.StatusCode())
	}
	
	if rateLimitErr.RetryAfter() == nil || *rateLimitErr.RetryAfter() != 60 {
		t.Error("Expected retry after to be 60")
	}
}
