package credlink

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"time"
)

// ============================================================================
// Main Client Implementation
// ============================================================================

// Client is the main CredLink client
type Client struct {
	config    *Config
	transport *Transport
	telemetry *TelemetryManager
}

// NewClient creates a new CredLink client
func NewClient(config *Config) *Client {
	if config == nil {
		config = DefaultConfig()
	}
	
	transport := NewTransport(config)
	telemetry := NewTelemetryManager(config.Telemetry)
	
	return &Client{
		config:    config,
		transport: transport,
		telemetry: telemetry,
	}
}

// NewClientWithAPIKey creates a new client with just an API key
func NewClientWithAPIKey(apiKey string) *Client {
	config := DefaultConfig()
	config.APIKey = apiKey
	return NewClient(config)
}

// ============================================================================
// Asset Verification
// ============================================================================

// VerifyAssetOptions defines options for asset verification
type VerifyAssetOptions struct {
	PolicyID              string
	ContentType           *string
	Timeout               *time.Duration
	CachedETag            *string
	CachedCertThumbprints []string
	EnableDelta           *bool
}

// VerifyAsset verifies a single asset by URL or direct content
func (c *Client) VerifyAsset(ctx context.Context, urlOrBuffer string, options VerifyAssetOptions) (*VerifyAssetResponse, error) {
	span := c.telemetry.CreateSpan("verify.asset", map[string]interface{}{
		"policy_id":      options.PolicyID,
		"has_content_type": options.ContentType != nil,
		"enable_delta":   options.EnableDelta != nil && *options.EnableDelta,
	})
	defer span.End()

	// Determine if this is a URL or buffer content
	isURL := c.isValidURL(urlOrBuffer)
	
	request := VerifyAssetRequest{
		PolicyID:              options.PolicyID,
		CachedCertThumbprints: options.CachedCertThumbprints,
		EnableDelta:           options.EnableDelta != nil && *options.EnableDelta,
	}

	if isURL {
		request.AssetURL = &urlOrBuffer
	} else {
		request.AssetBuffer = &urlOrBuffer
		if options.ContentType == nil {
			return nil, NewValidationError("Content type is required when verifying by buffer content")
		}
		request.ContentType = options.ContentType
	}

	// Set timeout if specified
	reqOptions := NewRequestOptions()
	if options.Timeout != nil {
		reqOptions = reqOptions.WithTimeout(*options.Timeout)
	}

	resp, err := c.transport.Request(ctx, "POST", "/verify/asset", request, reqOptions)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var verifyResp VerifyAssetResponse
	if err := json.NewDecoder(resp.Body).Decode(&verifyResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	span.SetAttribute("verified", verifyResp.Data.Verified)
	span.SetAttribute("cached", verifyResp.Data.Cached)

	return &verifyResp, nil
}

// VerifyPageOptions defines options for page verification
type VerifyPageOptions struct {
	FollowLinks *bool
	MaxDepth    *int
	PolicyID    *string
	Timeout     *time.Duration
}

// VerifyPageResult represents a result from page verification
type VerifyPageResult struct {
	URL         *string
	Verified    bool
	ManifestURL *string
	Error       *string
	HasMore     bool
	NextToken   *string
}

// VerifyPage verifies all assets on a web page
func (c *Client) VerifyPage(ctx context.Context, pageURL string, options VerifyPageOptions) (<-chan VerifyPageResult, error) {
	span := c.telemetry.CreateSpan("verify.page", map[string]interface{}{
		"url":          c.sanitizeURL(pageURL),
		"follow_links": options.FollowLinks != nil && *options.FollowLinks,
		"max_depth":    options.MaxDepth,
		"policy_id":    options.PolicyID,
	})
	defer span.End()

	followLinks := true
	if options.FollowLinks != nil {
		followLinks = *options.FollowLinks
	}

	maxDepth := 2
	if options.MaxDepth != nil {
		maxDepth = *options.MaxDepth
	}

	policyID := "default"
	if options.PolicyID != nil {
		policyID = *options.PolicyID
	}

	request := VerifyPageRequest{
		PageURL:     pageURL,
		FollowLinks: followLinks,
		MaxDepth:    maxDepth,
		PolicyID:    policyID,
		Timeout:     c.durationToIntPtr(options.Timeout),
	}

	reqOptions := NewRequestOptions()
	if options.Timeout != nil {
		reqOptions = reqOptions.WithTimeout(*options.Timeout)
	}

	ch, err := c.transport.RequestStream(ctx, "POST", "/verify/page", request, reqOptions)
	if err != nil {
		return nil, err
	}

	resultCh := make(chan VerifyPageResult, 10)

	go func() {
		defer close(resultCh)
		for item := range ch {
			result := VerifyPageResult{
				URL:       stringPtr(item["url"].(string)),
				Verified:  item["verified"].(bool),
				HasMore:   item["has_more"].(bool),
				NextToken: stringPtr(item["next_token"].(string)),
			}

			if manifestURL, ok := item["manifest_url"].(string); ok && manifestURL != "" {
				result.ManifestURL = &manifestURL
			}

			if errMsg, ok := item["error"].(string); ok && errMsg != "" {
				result.Error = &errMsg
			}

			resultCh <- result
		}
	}()

	return resultCh, nil
}

// ============================================================================
// Batch Operations
// ============================================================================

// BatchVerifyOptions defines options for batch verification
type BatchVerifyOptions struct {
	PolicyID       *string
	Parallel       *bool
	TimeoutPerAsset *time.Duration
}

// BatchVerifyResult represents a result from batch verification
type BatchVerifyResult struct {
	Asset    AssetReference
	Result   *VerificationResult
	Error    map[string]interface{}
	HasMore  bool
	NextToken *string
}

// BatchVerify verifies multiple assets
func (c *Client) BatchVerify(ctx context.Context, assets []string, options BatchVerifyOptions) (<-chan BatchVerifyResult, error) {
	span := c.telemetry.CreateSpan("batch.verify", map[string]interface{}{
		"asset_count": len(assets),
		"parallel":    options.Parallel != nil && *options.Parallel,
		"policy_id":   options.PolicyID,
	})
	defer span.End()

	// Normalize assets to AssetReference format
	normalizedAssets := make([]AssetReference, len(assets))
	for i, asset := range assets {
		normalizedAssets[i] = AssetReference{URL: asset}
	}

	policyID := "default"
	if options.PolicyID != nil {
		policyID = *options.PolicyID
	}

	parallel := true
	if options.Parallel != nil {
		parallel = *options.Parallel
	}

	request := BatchVerifyRequest{
		Assets:         normalizedAssets,
		PolicyID:       policyID,
		Parallel:       parallel,
		TimeoutPerAsset: c.durationToIntPtr(options.TimeoutPerAsset),
	}

	reqOptions := NewRequestOptions()
	if options.TimeoutPerAsset != nil {
		reqOptions = reqOptions.WithTimeout(*options.TimeoutPerAsset)
	}

	ch, err := c.transport.RequestStream(ctx, "POST", "/batch/verify", request, reqOptions)
	if err != nil {
		return nil, err
	}

	resultCh := make(chan BatchVerifyResult, 10)

	go func() {
		defer close(resultCh)
		for item := range ch {
			result := BatchVerifyResult{
				HasMore:   item["has_more"].(bool),
				NextToken: stringPtr(item["next_token"].(string)),
			}

			// Parse asset
			if assetData, ok := item["asset"].(map[string]interface{}); ok {
				result.Asset = AssetReference{
					URL: assetData["url"].(string),
					ID:  stringPtr(assetData["id"].(string)),
				}
			}

			// Parse result
			if resultData, ok := item["result"].(map[string]interface{}); ok {
				resultBytes, _ := json.Marshal(resultData)
				var verificationResult VerificationResult
				json.Unmarshal(resultBytes, &verificationResult)
				result.Result = &verificationResult
			}

			// Parse error
			if errorData, ok := item["error"].(map[string]interface{}); ok {
				result.Error = errorData
			}

			resultCh <- result
		}
	}()

	return resultCh, nil
}

// ============================================================================
// Link Management
// ============================================================================

// InjectLinkOptions defines options for link injection
type InjectLinkOptions struct {
	ManifestURL string
	Strategy    *string
	Selector    *string
}

// InjectLink injects C2PA manifest Link headers into HTML
func (c *Client) InjectLink(ctx context.Context, html string, options InjectLinkOptions) (*InjectLinkResponse, error) {
	span := c.telemetry.CreateSpan("link.inject", map[string]interface{}{
		"html_length": len(html),
		"strategy":    options.Strategy,
	})
	defer span.End()

	strategy := "sha256_path"
	if options.Strategy != nil {
		strategy = *options.Strategy
	}

	request := InjectLinkRequest{
		HTML:        html,
		ManifestURL: options.ManifestURL,
		Strategy:    strategy,
		Selector:    options.Selector,
	}

	resp, err := c.transport.Request(ctx, "POST", "/link/inject", request, NewRequestOptions())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var linkResp InjectLinkResponse
	if err := json.NewDecoder(resp.Body).Decode(&linkResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	span.SetAttribute("links_injected", linkResp.Data["links_injected"])

	return &linkResp, nil
}

// ============================================================================
// Signing Operations
// ============================================================================

// SignFolderOptions defines options for folder signing
type SignFolderOptions struct {
	ProfileID      string
	TSA            *bool
	Recursive      *bool
	FilePatterns   []string
	IdempotencyKey *string
}

// SignFolder retro-signs a folder with RFC-3161 timestamps
func (c *Client) SignFolder(ctx context.Context, folderPath string, options SignFolderOptions) (*SignFolderResponse, error) {
	span := c.telemetry.CreateSpan("sign.folder", map[string]interface{}{
		"folder_path": folderPath,
		"profile_id":  options.ProfileID,
		"tsa":         options.TSA,
		"recursive":   options.Recursive,
	})
	defer span.End()

	tsa := false
	if options.TSA != nil {
		tsa = *options.TSA
	}

	recursive := true
	if options.Recursive != nil {
		recursive = *options.Recursive
	}

	idempotencyKey := ""
	if options.IdempotencyKey != nil {
		idempotencyKey = *options.IdempotencyKey
	}
	if idempotencyKey == "" {
		idempotencyKey = c.generateIdempotencyKey()
	}

	request := SignFolderRequest{
		FolderPath:     folderPath,
		ProfileID:      options.ProfileID,
		TSA:            tsa,
		Recursive:      recursive,
		FilePatterns:   options.FilePatterns,
		IdempotencyKey: idempotencyKey,
	}

	reqOptions := NewRequestOptions().WithIdempotencyKey(idempotencyKey)

	resp, err := c.transport.Request(ctx, "POST", "/sign/folder", request, reqOptions)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var signResp SignFolderResponse
	if err := json.NewDecoder(resp.Body).Decode(&signResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	span.SetAttribute("job_id", signResp.Data["job_id"])
	span.SetAttribute("files_found", signResp.Data["files_found"])

	return &signResp, nil
}

// ============================================================================
// Manifest Operations
// ============================================================================

// GetManifestOptions defines options for getting a manifest
type GetManifestOptions struct {
	CachedETag *string
	Format     *string
}

// GetManifest gets a manifest by content hash
func (c *Client) GetManifest(ctx context.Context, hash string, options GetManifestOptions) (*ManifestResponse, error) {
	span := c.telemetry.CreateSpan("manifest.get", map[string]interface{}{
		"hash":   hash[:16] + "...",
		"format": options.Format,
	})
	defer span.End()

	if !c.isValidHash(hash) {
		return nil, NewValidationError("Invalid hash format. Must be a 64-character hexadecimal string.")
	}

	reqOptions := NewRequestOptions()
	if options.CachedETag != nil {
		reqOptions = reqOptions.WithHeader("If-None-Match", *options.CachedETag)
	}

	resp, err := c.transport.Request(ctx, "GET", "/manifests/"+hash, nil, reqOptions)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var manifestResp ManifestResponse
	if err := json.NewDecoder(resp.Body).Decode(&manifestResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	span.SetAttribute("cached", manifestResp.Data["cached"])

	return &manifestResp, nil
}

// PutManifestOptions defines options for storing a manifest
type PutManifestOptions struct {
	ContentType     *string
	Metadata        map[string]interface{}
	IdempotencyKey *string
}

// PutManifest stores or updates a manifest
func (c *Client) PutManifest(ctx context.Context, hash string, content []byte, options PutManifestOptions) (*ManifestResponse, error) {
	span := c.telemetry.CreateSpan("manifest.put", map[string]interface{}{
		"hash":         hash[:16] + "...",
		"content_type": options.ContentType,
	})
	defer span.End()

	if !c.isValidHash(hash) {
		return nil, NewValidationError("Invalid hash format. Must be a 64-character hexadecimal string.")
	}

	// Convert content to base64 string
	contentStr := base64.StdEncoding.EncodeToString(content)

	contentType := "application/c2pa"
	if options.ContentType != nil {
		contentType = *options.ContentType
	}

	idempotencyKey := ""
	if options.IdempotencyKey != nil {
		idempotencyKey = *options.IdempotencyKey
	}
	if idempotencyKey == "" {
		idempotencyKey = c.generateIdempotencyKey()
	}

	request := ManifestRequest{
		Content:     &contentStr,
		ContentType: contentType,
		Metadata:    options.Metadata,
	}

	reqOptions := NewRequestOptions().WithIdempotencyKey(idempotencyKey)

	resp, err := c.transport.Request(ctx, "PUT", "/manifests/"+hash, request, reqOptions)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var manifestResp ManifestResponse
	if err := json.NewDecoder(resp.Body).Decode(&manifestResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	span.SetAttribute("stored", true)

	return &manifestResp, nil
}

// ============================================================================
// Job Management
// ============================================================================

// GetJobStatus gets job status for long-running operations
func (c *Client) GetJobStatus(ctx context.Context, jobID string) (*JobStatus, error) {
	span := c.telemetry.CreateSpan("job.get_status", map[string]interface{}{
		"job_id": jobID,
	})
	defer span.End()

	resp, err := c.transport.Request(ctx, "GET", "/jobs/"+jobID, nil, NewRequestOptions())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var jobStatus JobStatus
	if err := json.NewDecoder(resp.Body).Decode(&jobStatus); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	span.SetAttribute("job_status", jobStatus.Status)

	return &jobStatus, nil
}

// ============================================================================
// Utility Methods
// ============================================================================

// GetCircuitBreakerState returns the current circuit breaker state
func (c *Client) GetCircuitBreakerState() string {
	return c.transport.GetCircuitBreakerState()
}

// IsTelemetryEnabled returns whether telemetry is enabled
func (c *Client) IsTelemetryEnabled() bool {
	return c.telemetry.IsEnabled()
}

// Close closes the client and cleans up resources
func (c *Client) Close() {
	c.transport.Close()
}

// ============================================================================
// Private Helper Methods
// ============================================================================

func (c *Client) isValidURL(stringURL string) bool {
	_, err := url.Parse(stringURL)
	return err == nil
}

func (c *Client) isValidHash(hash string) bool {
	if len(hash) != 64 {
		return false
	}
	for _, c := range hash {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

func (c *Client) sanitizeURL(rawURL string) string {
	if parsedURL, err := url.Parse(rawURL); err == nil {
		return fmt.Sprintf("%s://%s%s", parsedURL.Scheme, parsedURL.Host, parsedURL.Path)
	}
	return "invalid-url"
}

func (c *Client) generateIdempotencyKey() string {
	return c.transport.generateIdempotencyKey()
}

func (c *Client) durationToIntPtr(d *time.Duration) *int {
	if d == nil {
		return nil
	}
	milliseconds := int(d.Milliseconds())
	return &milliseconds
}

// Helper function for string pointers
func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
