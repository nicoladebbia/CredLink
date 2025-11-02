<?php

namespace C2C;

use Exception;
use WP_Error;

class Injector {
    // SECURITY: Use environment variables for sensitive data
    private static $sign_endpoint;
    private static $tenant_id = null;
    private static $initialized = false;
    private static $api_key = null;
    private static $max_retries = 6;
    private static $base_delay = 250; // ms
    private static $max_file_size = 50 * 1024 * 1024; // 50MB
    private static $allowed_mime_types = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/avif'
    ];

    /**
     * Initialize the injector with security validation
     */
    public static function init() {
        if (self::$initialized) {
            return;
        }
        
        try {
            // SECURITY: Validate tenant ID
            self::$tenant_id = self::validateTenantId(get_option('c2c_tenant_id', 'default'));
            
            // SECURITY: Get sign endpoint from environment
            self::$sign_endpoint = self::validateSignEndpoint(
                getenv('C2_SIGN_ENDPOINT') ?: 'https://api.c2concierge.com/sign'
            );
            
            // SECURITY: Get API key from environment
            self::$api_key = self::validateApiKey(getenv('C2_API_KEY'));
            
            // SECURITY: Validate configuration
            if (!self::$sign_endpoint || !self::$tenant_id) {
                throw new Exception('Invalid injector configuration');
            }
            
            self::$initialized = true;
            error_log('C2C: Injector initialized successfully');
            
        } catch (Exception $e) {
            error_log('C2C: Injector initialization failed: ' . $e->getMessage());
            self::$initialized = false;
        }
    }

    /**
     * Hook: add_attachment - called when media is uploaded
     * SECURITY: Enhanced with comprehensive validation
     */
    public static function onAddAttachment($post_id) {
        try {
            // SECURITY: Validate user capabilities
            if (!self::validateUserCapabilities()) {
                error_log('C2C: Unauthorized upload attempt for attachment ' . $post_id);
                return;
            }

            // SECURITY: Validate post ID
            $post_id = self::validatePostId($post_id);
            if ($post_id === false) {
                error_log('C2C: Invalid post ID provided');
                return;
            }

            // SECURITY: Validate attachment
            $attachment = self::validateAttachment($post_id);
            if (!$attachment) {
                error_log('C2C: Invalid attachment ' . $post_id);
                return;
            }

            // SECURITY: Validate file URL
            $file_url = self::validateFileUrl($post_id);
            if (!$file_url) {
                error_log('C2C: Invalid file URL for attachment ' . $post_id);
                return;
            }

            // SECURITY: Validate file size
            if (!self::validateFileSize($post_id)) {
                error_log('C2C: File too large for attachment ' . $post_id);
                return;
            }

            // SECURITY: Validate MIME type
            if (!self::validateMimeType($post_id)) {
                error_log('C2C: Invalid MIME type for attachment ' . $post_id);
                return;
            }

            // SECURITY: Rate limiting check
            if (!self::checkRateLimit()) {
                error_log('C2C: Rate limit exceeded for attachment ' . $post_id);
                return;
            }

            // Call sign endpoint with security
            $sign_result = self::callSignEndpointSecure($file_url, $post_id);
            if (!$sign_result) {
                error_log("C2C: Failed to sign attachment {$post_id}");
                return;
            }

            // Store manifest URL and mode with validation
            self::storeManifestData($post_id, $sign_result);

            // Run optimizer detection with error handling
            if (class_exists('C2C\OptimizerDetector')) {
                OptimizerDetector::checkAttachment($post_id);
            }

        } catch (Exception $e) {
            error_log('C2C: Error in onAddAttachment: ' . $e->getMessage());
        }
    }

    /**
     * SECURITY: Validate user capabilities
     */
    private static function validateUserCapabilities() {
        if (!current_user_can('upload_files')) {
            return false;
        }
        
        // Additional security checks
        if (!current_user_can('edit_posts')) {
            return false;
        }
        
        // Check if user is logged in
        if (!is_user_logged_in()) {
            return false;
        }
        
        return true;
    }

    /**
     * SECURITY: Validate post ID
     */
    private static function validatePostId($post_id) {
        if (!is_numeric($post_id)) {
            return false;
        }
        
        $post_id = (int)$post_id;
        
        if ($post_id <= 0) {
            return false;
        }
        
        if ($post_id > PHP_INT_MAX) {
            return false;
        }
        
        return $post_id;
    }

    /**
     * SECURITY: Validate attachment
     */
    private static function validateAttachment($post_id) {
        $attachment = get_post($post_id);
        
        if (!$attachment) {
            return false;
        }
        
        if ($attachment->post_type !== 'attachment') {
            return false;
        }
        
        if ($attachment->post_status !== 'inherit') {
            return false;
        }
        
        return $attachment;
    }

    /**
     * SECURITY: Validate file URL
     */
    private static function validateFileUrl($post_id) {
        $file_url = wp_get_attachment_url($post_id);
        
        if (!$file_url) {
            return false;
        }
        
        // SECURITY: URL validation
        if (!filter_var($file_url, FILTER_VALIDATE_URL)) {
            return false;
        }
        
        // SECURITY: Check protocol
        $parsed_url = parse_url($file_url);
        if (!in_array($parsed_url['scheme'] ?? '', ['http', 'https'])) {
            return false;
        }
        
        // SECURITY: Check for dangerous patterns
        if (strpos($file_url, '..') !== false || strpos($file_url, '://') === false) {
            return false;
        }
        
        return $file_url;
    }

    /**
     * SECURITY: Validate file size
     */
    private static function validateFileSize($post_id) {
        $file_path = get_attached_file($post_id);
        
        if (!$file_path || !file_exists($file_path)) {
            return false;
        }
        
        $file_size = filesize($file_path);
        
        if ($file_size === false) {
            return false;
        }
        
        if ($file_size > self::$max_file_size) {
            return false;
        }
        
        if ($file_size <= 0) {
            return false;
        }
        
        return true;
    }

    /**
     * SECURITY: Validate MIME type
     */
    private static function validateMimeType($post_id) {
        $mime_type = get_post_mime_type($post_id);
        
        if (!$mime_type) {
            return false;
        }
        
        if (!in_array($mime_type, self::$allowed_mime_types)) {
            return false;
        }
        
        return true;
    }

    /**
     * SECURITY: Check rate limiting
     */
    private static function checkRateLimit() {
        $user_id = get_current_user_id();
        $cache_key = "c2c_rate_limit_{$user_id}";
        $current_count = wp_cache_get($cache_key);
        
        if ($current_count === false) {
            wp_cache_set($cache_key, 1, '', 60); // 1 minute window
            return true;
        }
        
        if ($current_count >= 10) { // 10 requests per minute
            return false;
        }
        
        wp_cache_set($cache_key, $current_count + 1, '', 60);
        return true;
    }

    /**
     * SECURITY: Validate tenant ID
     */
    private static function validateTenantId($tenant_id) {
        if (!$tenant_id || !is_string($tenant_id)) {
            return 'default';
        }
        
        // SECURITY: Sanitize tenant ID
        $tenant_id = sanitize_text_field($tenant_id);
        
        // SECURITY: Length validation
        if (strlen($tenant_id) > 100) {
            return 'default';
        }
        
        // SECURITY: Pattern validation
        if (!preg_match('/^[a-zA-Z0-9_-]+$/', $tenant_id)) {
            return 'default';
        }
        
        return $tenant_id;
    }

    /**
     * SECURITY: Validate sign endpoint
     */
    private static function validateSignEndpoint($endpoint) {
        if (!$endpoint || !is_string($endpoint)) {
            return null;
        }
        
        // SECURITY: URL validation
        if (!filter_var($endpoint, FILTER_VALIDATE_URL)) {
            return null;
        }
        
        // SECURITY: Check protocol
        $parsed_url = parse_url($endpoint);
        if (!in_array($parsed_url['scheme'] ?? '', ['https'])) {
            return null; // Only HTTPS allowed
        }
        
        // SECURITY: Check for dangerous patterns
        if (strpos($endpoint, '..') !== false) {
            return null;
        }
        
        return rtrim($endpoint, '/');
    }

    /**
     * SECURITY: Validate API key
     */
    private static function validateApiKey($api_key) {
        if (!$api_key || !is_string($api_key)) {
            return null;
        }
        
        // SECURITY: Length validation
        if (strlen($api_key) < 10 || strlen($api_key) > 500) {
            return null;
        }
        
        // SECURITY: Pattern validation
        if (!preg_match('/^[a-zA-Z0-9_\-\.]+$/', $api_key)) {
            return null;
        }
        
        return $api_key;
    }

    /**
     * SECURITY: Store manifest data with validation
     */
    private static function storeManifestData($post_id, $sign_result) {
        if (!is_array($sign_result) || !isset($sign_result['manifest_url'])) {
            throw new Exception('Invalid sign result data');
        }
        
        // SECURITY: Validate manifest URL
        $manifest_url = self::validateSignEndpoint($sign_result['manifest_url']);
        if (!$manifest_url) {
            throw new Exception('Invalid manifest URL in sign result');
        }
        
        // SECURITY: Validate mode
        $mode = isset($sign_result['mode']) ? sanitize_text_field($sign_result['mode']) : 'remote';
        if (!in_array($mode, ['remote', 'embed'])) {
            $mode = 'remote';
        }
        
        // SECURITY: Store with validation
        $result1 = update_post_meta($post_id, '_c2_manifest_url', $manifest_url);
        $result2 = update_post_meta($post_id, '_c2_mode', $mode);
        $result3 = update_post_meta($post_id, '_c2_signed_at', current_time('mysql'));
        
        if (!$result1 || !$result2 || !$result3) {
            throw new Exception('Failed to store manifest data');
        }
    }

    /**
     * SECURITY: Call signing endpoint with comprehensive security
     */
    private static function callSignEndpointSecure($asset_url, $post_id) {
        try {
            // SECURITY: Validate inputs
            if (!$asset_url || !$post_id) {
                throw new Exception('Invalid parameters for sign endpoint');
            }
            
            // SECURITY: Prepare payload with validation
            $payload = [
                'asset_url' => $asset_url,
                'tenant_id' => self::$tenant_id,
                'post_id' => $post_id,
                'timestamp' => time(),
                'nonce' => wp_create_nonce('c2c_sign_' . $post_id)
            ];
            
            // SECURITY: Prepare headers
            $headers = [
                'Content-Type' => 'application/json',
                'User-Agent' => 'C2Concierge-WP/' . (defined('C2C_VERSION') ? C2C_VERSION : '0.1.0'),
                'Accept' => 'application/json',
                'Cache-Control' => 'no-cache',
                'Pragma' => 'no-cache'
            ];
            
            // SECURITY: Add API key if available
            if (self::$api_key) {
                $headers['Authorization'] = 'Bearer ' . self::$api_key;
            }
            
            // SECURITY: Call with timeout and retry logic
            return self::executeSecureRequest($payload, $headers);
            
        } catch (Exception $e) {
            error_log('C2C: Error in callSignEndpointSecure: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Execute secure request with comprehensive error handling
     */
    private static function executeSecureRequest($payload, $headers) {
        $max_retries = self::$max_retries;
        $base_delay = self::$base_delay;
        
        for ($attempt = 1; $attempt <= $max_retries; $attempt++) {
            try {
                // SECURITY: Request with timeout
                $response = wp_remote_post(self::$sign_endpoint, [
                    'timeout' => 30,
                    'headers' => $headers,
                    'body' => json_encode($payload),
                    'sslverify' => true,
                    'user-agent' => $headers['User-Agent']
                ]);

                // SECURITY: Validate response
                if (is_wp_error($response)) {
                    throw new Exception('HTTP request failed: ' . $response->get_error_message());
                }

                $status = wp_remote_retrieve_response_code($response);
                $body = wp_remote_retrieve_body($response);
                
                // SECURITY: Validate status code
                if ($status === 200) {
                    return self::processSuccessResponse($body);
                } elseif ($status === 429) {
                    // SECURITY: Rate limiting with proper backoff
                    $delay = self::calculateRetryDelay($response, $attempt, $base_delay);
                    if ($attempt < $max_retries) {
                        usleep($delay * 1000);
                        continue;
                    }
                } elseif ($status >= 500) {
                    // SECURITY: Server errors with backoff
                    if ($attempt < $max_retries) {
                        $delay = self::calculateBackoff($attempt, $base_delay);
                        usleep($delay * 1000);
                        continue;
                    }
                } else {
                    // SECURITY: Client errors - don't retry
                    error_log("C2C: HTTP error {$status} from sign endpoint");
                    return false;
                }
                
            } catch (Exception $e) {
                error_log("C2C: Request attempt {$attempt} failed: " . $e->getMessage());
                
                if ($attempt < $max_retries) {
                    $delay = self::calculateBackoff($attempt, $base_delay);
                    usleep($delay * 1000);
                }
            }
        }
        
        error_log('C2C: All retry attempts exhausted');
        return false;
    }

    /**
     * SECURITY: Process successful response
     */
    private static function processSuccessResponse($body) {
        if (empty($body)) {
            throw new Exception('Empty response body');
        }
        
        $data = json_decode($body, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception('Invalid JSON response: ' . json_last_error_msg());
        }
        
        if (!$data || !is_array($data)) {
            throw new Exception('Invalid response data structure');
        }
        
        if (!isset($data['manifest_url'])) {
            throw new Exception('Missing manifest_url in response');
        }
        
        // SECURITY: Validate response data
        $data['manifest_url'] = self::validateSignEndpoint($data['manifest_url']);
        if (!$data['manifest_url']) {
            throw new Exception('Invalid manifest_url in response');
        }
        
        return $data;
    }

    /**
     * SECURITY: Calculate retry delay with proper validation
     */
    private static function calculateRetryDelay($response, $attempt, $base_delay) {
        $retry_after = wp_remote_retrieve_header($response, 'Retry-After');
        
        if ($retry_after && is_numeric($retry_after)) {
            $delay = (int)$retry_after * 1000;
        } else {
            $delay = self::calculateBackoff($attempt, $base_delay);
        }
        
        // SECURITY: Validate delay
        if ($delay > 60000) { // Max 60 seconds
            $delay = 60000;
        }
        
        return $delay;
    }

    /**
     * SECURITY: Calculate exponential backoff with jitter
     */
    private static function calculateBackoff($attempt, $base_delay) {
        $exponential = $base_delay * pow(2, $attempt - 1);
        $jitter = $exponential * 0.3 * (mt_rand() / mt_getrandmax() - 0.5) * 2;
        $delay = $exponential + $jitter;
        
        // SECURITY: Validate delay bounds
        if ($delay < $base_delay) {
            $delay = $base_delay;
        }
        
        if ($delay > 60000) { // Max 60 seconds
            $delay = 60000;
        }
        
        return (int)$delay;
    }
        }

        return false;
    }

    /**
     * Calculate exponential backoff with jitter
     */
    private static function calculateBackoff($attempt, $base_delay) {
        $exponential = $base_delay * pow(2, $attempt - 1);
        $jitter = $exponential * 0.3 * (mt_rand() / mt_getrandmax());
        return min($exponential + $jitter, 60000); // Max 60 seconds
    }

    /**
     * Filter: wp_get_attachment_image_attributes - add C2PA data attributes
     */
    public static function imgAttrs($attr, $attachment, $size) {
        $manifest_url = get_post_meta($attachment->ID, '_c2_manifest_url', true);
        if ($manifest_url) {
            $attr['data-c2pa-manifest'] = esc_url($manifest_url);
            $attr['data-c2-policy'] = get_option('c2c_remote_only', false) ? 'remote' : 'preserve-allowed';
        }
        return $attr;
    }

    /**
     * Filter: the_content - inject badges for remote-only mode
     */
    public static function filterContent($content) {
        if (get_option('c2c_remote_only', false) && get_option('c2c_show_badges', true)) {
            // Parse img tags and add badges
            $content = preg_replace_callback('/<img([^>]+)>/i', function($matches) {
                $img_tag = $matches[0];
                
                // Extract attachment ID from class if present
                if (preg_match('/wp-image-(\d+)/i', $matches[1], $id_match)) {
                    $attachment_id = $id_match[1];
                    $manifest_url = get_post_meta($attachment_id, '_c2_manifest_url', true);
                    
                    if ($manifest_url) {
                        $badge = sprintf(
                            '<c2-badge data-manifest-url="%s" data-asset-url="%s"></c2-badge>',
                            esc_url($manifest_url),
                            esc_url(wp_get_attachment_url($attachment_id))
                        );
                        return $img_tag . $badge;
                    }
                }
                
                return $img_tag;
            }, $content);
        }
        
        return $content;
    }

    /**
     * Action: wp_head - emit manifest links
     */
    public static function emitHeadLinks() {
        $links = self::getCurrentPageManifestLinks();
        
        foreach ($links as $link) {
            printf(
                '<link rel="c2pa-manifest" href="%s" data-asset="%s">%s',
                esc_url($link['href']),
                esc_url($link['asset']),
                "\n"
            );
        }
    }

    /**
     * Get manifest links for current page
     */
    private static function getCurrentPageManifestLinks() {
        global $post;
        $links = [];
        
        if (!$post) return $links;

        // Find all images in current post content
        if (preg_match_all('/wp-image-(\d+)/i', $post->post_content, $matches)) {
            foreach ($matches[1] as $attachment_id) {
                $manifest_url = get_post_meta($attachment_id, '_c2_manifest_url', true);
                $asset_url = wp_get_attachment_url($attachment_id);
                
                if ($manifest_url && $asset_url) {
                    $links[] = [
                        'href' => $manifest_url,
                        'asset' => $asset_url
                    ];
                }
            }
        }

        // Check featured image
        if (has_post_thumbnail($post->ID)) {
            $thumbnail_id = get_post_thumbnail_id($post->ID);
            $manifest_url = get_post_meta($thumbnail_id, '_c2_manifest_url', true);
            $asset_url = wp_get_attachment_url($thumbnail_id);
            
            if ($manifest_url && $asset_url) {
                $links[] = [
                    'href' => $manifest_url,
                    'asset' => $asset_url
                ];
            }
        }

        return array_unique($links, SORT_REGULAR);
    }

    /**
     * Get all attachments needing retro-signing
     */
    public static function getAttachmentsForRetroSign($days_back = 7) {
        global $wpdb;
        
        $cutoff_date = date('Y-m-d H:i:s', strtotime("-{$days_back} days"));
        
        $attachments = $wpdb->get_results($wpdb->prepare("
            SELECT p.ID, p.post_date, pm.meta_value as manifest_url
            FROM {$wpdb->posts} p
            LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_c2_manifest_url'
            WHERE p.post_type = 'attachment'
            AND p.post_date > %s
            AND p.post_mime_name LIKE 'image/%'
            ORDER BY p.post_date DESC
        ", $cutoff_date));

        return $attachments;
    }

    /**
     * Process retro-sign for attachment
     */
    public static function processRetroSign($attachment_id) {
        $file_url = wp_get_attachment_url($attachment_id);
        if (!$file_url) return false;

        $sign_result = self::callSignEndpoint($file_url);
        if (!$sign_result) return false;

        update_post_meta($attachment_id, '_c2_manifest_url', $sign_result['manifest_url']);
        update_post_meta($attachment_id, '_c2_mode', $sign_result['mode']);
        update_post_meta($attachment_id, '_c2_signed_at', current_time('mysql'));

        return true;
    }
}
