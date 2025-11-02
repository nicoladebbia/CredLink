<?php

namespace C2C;

use Exception;
use WP_Error;

class OptimizerDetector {
    private static $initialized = false;
    private static $max_file_size = 100 * 1024 * 1024; // 100MB
    private static $allowed_mime_types = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/avif'
    ];
    private static $known_optimizers = [
        'ewww-image-optimizer/ewww-image-optimizer.php',
        'smush-pro/wp-smush-pro.php',
        'shortpixel-image-optimiser/wp-shortpixel.php',
        'imagify/imagify.php',
        'tiny-compress-images/tiny-compress-images.php',
        'wp-optimization/wp-optimization.php'
    ];
    private static $cdn_patterns = [
        'cloudinary.com',
        'imgix.net',
        'imagekit.io',
        'cloudfront.net',
        'fastly.net',
        'akamaized.net',
        'cdn.jsdelivr.net',
        'unpkg.com'
    ];

    /**
     * Initialize optimizer detector with comprehensive security
     */
    public static function init() {
        if (self::$initialized) {
            return;
        }
        
        try {
            // SECURITY: Validate WordPress context
            if (!self::validateWordPressContext()) {
                throw new Exception('Invalid WordPress context for optimizer detector');
            }

            // SECURITY: Validate hook registration
            if (self::validateHookRegistration()) {
                add_filter('wp_generate_attachment_metadata', [__CLASS__, 'onImageProcessing'], 10, 2);
                add_filter('intermediate_image_sizes_advanced', [__CLASS__, 'onIntermediateSizes'], 10, 3);
            }
            
            self::$initialized = true;
            error_log('C2C: OptimizerDetector initialized successfully');
            
        } catch (Exception $e) {
            error_log('C2C: OptimizerDetector initialization failed: ' . $e->getMessage());
            self::$initialized = false;
        }
    }

    /**
     * SECURITY: Validate WordPress context
     */
    private static function validateWordPressContext() {
        // Check WordPress functions exist
        $required_functions = [
            'add_filter',
            'get_attached_file',
            'getimagesize',
            'wp_get_attachment_metadata',
            'get_option',
            'update_option',
            'current_time',
            'error_log'
        ];
        
        foreach ($required_functions as $function) {
            if (!function_exists($function)) {
                error_log("C2C: Required WordPress function missing: {$function}");
                return false;
            }
        }
        
        return true;
    }

    /**
     * SECURITY: Validate hook registration
     */
    private static function validateHookRegistration() {
        // Check if hooks can be registered
        if (!function_exists('add_filter')) {
            return false;
        }
        
        // Check class methods exist
        $required_methods = [
            'onImageProcessing',
            'onIntermediateSizes',
            'checkAttachment',
            'detectOptimizers',
            'detectBigImageScaling',
            'detectExcessiveIntermediateSizes',
            'detectJpegRecompression',
            'detectOptimizerPlugins',
            'detectCdnTransformations',
            'triggerRetroSign'
        ];
        
        foreach ($required_methods as $method) {
            if (!method_exists(__CLASS__, $method)) {
                error_log("C2C: Required method missing: {$method}");
                return false;
            }
        }
        
        return true;
    }

    /**
     * SECURITY: Check attachment for optimizer detection with validation
     */
    public static function checkAttachment($attachment_id) {
        try {
            // SECURITY: Validate attachment ID
            $attachment_id = self::validateAttachmentId($attachment_id);
            if ($attachment_id === false) {
                error_log('C2C: Invalid attachment ID provided for optimizer check');
                return false;
            }

            // SECURITY: Validate file exists and is accessible
            $file_path = self::validateFilePath($attachment_id);
            if (!$file_path) {
                error_log('C2C: Invalid file path for attachment ' . $attachment_id);
                return false;
            }

            // SECURITY: Validate file size
            if (!self::validateFileSize($file_path)) {
                error_log('C2C: File too large for optimizer check: ' . $attachment_id);
                return false;
            }

            // SECURITY: Validate MIME type
            if (!self::validateMimeType($attachment_id)) {
                error_log('C2C: Invalid MIME type for optimizer check: ' . $attachment_id);
                return false;
            }

            // SECURITY: Rate limiting
            if (!self::checkRateLimit()) {
                error_log('C2C: Optimizer check rate limit exceeded');
                return false;
            }

            // Perform detection with security
            $detection_result = self::detectOptimizersSecure($attachment_id, $file_path);
            
            if ($detection_result['detected']) {
                // SECURITY: Validate detection result
                $reason = self::validateDetectionReason($detection_result['reason']);
                
                // SECURITY: Update options with validation
                self::updatePolicyOptions($reason);
                
                // SECURITY: Log with sanitization
                error_log('C2C: Remote-only enforced due to: ' . $reason);
                
                // SECURITY: Trigger retro-sign with validation
                self::triggerRetroSignSecure();
            }

            return $detection_result['detected'];

        } catch (Exception $e) {
            error_log('C2C: Error in checkAttachment: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Validate attachment ID
     */
    private static function validateAttachmentId($attachment_id) {
        if (!is_numeric($attachment_id)) {
            return false;
        }
        
        $attachment_id = (int)$attachment_id;
        
        if ($attachment_id <= 0) {
            return false;
        }
        
        if ($attachment_id > PHP_INT_MAX) {
            return false;
        }
        
        // Check if attachment exists
        if (!get_post($attachment_id)) {
            return false;
        }
        
        return $attachment_id;
    }

    /**
     * SECURITY: Validate file path
     */
    private static function validateFilePath($attachment_id) {
        $file_path = get_attached_file($attachment_id);
        
        if (!$file_path) {
            return false;
        }
        
        // SECURITY: Check for path traversal
        if (strpos($file_path, '..') !== false) {
            return false;
        }
        
        // SECURITY: Check if file exists
        if (!file_exists($file_path)) {
            return false;
        }
        
        // SECURITY: Check if file is readable
        if (!is_readable($file_path)) {
            return false;
        }
        
        // SECURITY: Validate file path format
        if (!preg_match('/^[a-zA-Z0-9\/\-_\.]+\.(jpg|jpeg|png|gif|webp|avif)$/i', $file_path)) {
            return false;
        }
        
        return $file_path;
    }

    /**
     * SECURITY: Validate file size
     */
    private static function validateFileSize($file_path) {
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
    private static function validateMimeType($attachment_id) {
        $mime_type = get_post_mime_type($attachment_id);
        
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
        $cache_key = 'c2c_optimizer_rate_limit';
        $current_count = wp_cache_get($cache_key);
        
        if ($current_count === false) {
            wp_cache_set($cache_key, 1, '', 60); // 1 minute window
            return true;
        }
        
        if ($current_count >= 50) { // 50 checks per minute
            return false;
        }
        
        wp_cache_set($cache_key, $current_count + 1, '', 60);
        return true;
    }

    /**
     * SECURITY: Detect optimizers with comprehensive validation
     */
    private static function detectOptimizersSecure($attachment_id, $file_path) {
        try {
            // SECURITY: Validate inputs
            if (!$attachment_id || !$file_path) {
                throw new Exception('Invalid parameters for optimizer detection');
            }

            // Check 1: Big image scaling
            if (self::detectBigImageScalingSecure($attachment_id, $file_path)) {
                return ['detected' => true, 'reason' => 'big_image_scaling'];
            }

            // Check 2: Multiple intermediate sizes
            if (self::detectExcessiveIntermediateSizesSecure($attachment_id)) {
                return ['detected' => true, 'reason' => 'intermediate_sizes'];
            }

            // Check 3: JPEG quality reduction
            if (self::detectJpegRecompressionSecure($attachment_id)) {
                return ['detected' => true, 'reason' => 'jpeg_recompression'];
            }

            // Check 4: Known optimizer plugins
            if (self::detectOptimizerPluginsSecure()) {
                return ['detected' => true, 'reason' => 'optimizer_detected'];
            }

            // Check 5: CDN transformations
            if (self::detectCdnTransformationsSecure()) {
                return ['detected' => true, 'reason' => 'cdn_transformations'];
            }

            return ['detected' => false, 'reason' => ''];

        } catch (Exception $e) {
            error_log('C2C: Error in detectOptimizersSecure: ' . $e->getMessage());
            return ['detected' => false, 'reason' => ''];
        }
    }

    /**
     * SECURITY: Detect big image scaling with validation
     */
    private static function detectBigImageScalingSecure($attachment_id, $file_path) {
        try {
            // SECURITY: Get threshold with validation
            $threshold = self::getBigImageThreshold();
            if ($threshold === false) {
                return false; // Disabled
            }

            // SECURITY: Get image dimensions with validation
            $image_size = self::getImageDimensionsSecure($file_path);
            if (!$image_size) {
                return false;
            }

            list($width, $height) = $image_size;
            
            // SECURITY: Check if image exceeds threshold
            if ($width > $threshold || $height > $threshold) {
                // SECURITY: Check if scaled version was created
                if (self::hasScaledVersion($attachment_id)) {
                    return true;
                }
            }

            return false;

        } catch (Exception $e) {
            error_log('C2C: Error in detectBigImageScalingSecure: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Get big image threshold with validation
     */
    private static function getBigImageThreshold() {
        $threshold = get_option('big_image_size_threshold', 2560);
        
        if ($threshold === false || $threshold === null) {
            return false;
        }
        
        $threshold = (int)$threshold;
        
        if ($threshold <= 0) {
            return false; // Disabled
        }
        
        if ($threshold > 10000) {
            return 2560; // Reasonable default
        }
        
        return $threshold;
    }

    /**
     * SECURITY: Get image dimensions with validation
     */
    private static function getImageDimensionsSecure($file_path) {
        try {
            // SECURITY: Check if getimagesize function exists
            if (!function_exists('getimagesize')) {
                return false;
            }

            // SECURITY: Suppress warnings and check result
            $image_size = @getimagesize($file_path);
            
            if (!$image_size) {
                return false;
            }
            
            if (!is_array($image_size) || count($image_size) < 2) {
                return false;
            }
            
            $width = (int)$image_size[0];
            $height = (int)$image_size[1];
            
            if ($width <= 0 || $height <= 0) {
                return false;
            }
            
            if ($width > 50000 || $height > 50000) {
                return false; // Unreasonably large
            }
            
            return [$width, $height];

        } catch (Exception $e) {
            error_log('C2C: Error getting image dimensions: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Check if scaled version exists
     */
    private static function hasScaledVersion($attachment_id) {
        try {
            $metadata = wp_get_attachment_metadata($attachment_id);
            
            if (!$metadata || !is_array($metadata)) {
                return false;
            }
            
            if (!isset($metadata['sizes']) || !is_array($metadata['sizes'])) {
                return false;
            }
            
            return isset($metadata['sizes']['scaled']);

        } catch (Exception $e) {
            error_log('C2C: Error checking scaled version: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Detect excessive intermediate sizes
     */
    private static function detectExcessiveIntermediateSizesSecure($attachment_id) {
        try {
            $metadata = wp_get_attachment_metadata($attachment_id);
            
            if (!$metadata || !is_array($metadata)) {
                return false;
            }
            
            if (!isset($metadata['sizes']) || !is_array($metadata['sizes'])) {
                return false;
            }
            
            $size_count = count($metadata['sizes']);
            
            // SECURITY: Check if there are too many intermediate sizes
            if ($size_count > 5) {
                return true;
            }

            return false;

        } catch (Exception $e) {
            error_log('C2C: Error in detectExcessiveIntermediateSizesSecure: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Detect JPEG recompression
     */
    private static function detectJpegRecompressionSecure($attachment_id) {
        try {
            $mime_type = get_post_mime_type($attachment_id);
            
            if ($mime_type !== 'image/jpeg' && $mime_type !== 'image/jpg') {
                return false;
            }

            // SECURITY: Check JPEG quality settings
            $jpeg_quality = get_option('jpeg_quality', 82);
            
            if ($jpeg_quality < 100) {
                return true;
            }

            // SECURITY: Check for optimizer quality settings
            $ewww_quality = get_option('ewww_image_optimizer_jpeg_quality');
            if ($ewww_quality && $ewww_quality < 100) {
                return true;
            }

            return false;

        } catch (Exception $e) {
            error_log('C2C: Error in detectJpegRecompressionSecure: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Detect optimizer plugins
     */
    private static function detectOptimizerPluginsSecure() {
        try {
            if (!function_exists('is_plugin_active')) {
                return false;
            }

            foreach (self::$known_optimizers as $plugin) {
                if (is_plugin_active($plugin)) {
                    return true;
                }
            }

            return false;

        } catch (Exception $e) {
            error_log('C2C: Error in detectOptimizerPluginsSecure: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Detect CDN transformations
     */
    private static function detectCdnTransformationsSecure() {
        try {
            // SECURITY: Check for CDN URLs in options
            $cdn_options = [
                'cloudinary_url',
                'imgix_url',
                'imagekit_url',
                'cloudfront_url',
                'fastly_url'
            ];

            foreach ($cdn_options as $option) {
                $value = get_option($option);
                if ($value && self::isCdnUrl($value)) {
                    return true;
                }
            }

            return false;

        } catch (Exception $e) {
            error_log('C2C: Error in detectCdnTransformationsSecure: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * SECURITY: Check if URL is CDN URL
     */
    private static function isCdnUrl($url) {
        if (!$url || !is_string($url)) {
            return false;
        }

        foreach (self::$cdn_patterns as $pattern) {
            if (strpos($url, $pattern) !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * SECURITY: Validate detection reason
     */
    private static function validateDetectionReason($reason) {
        $allowed_reasons = [
            'big_image_scaling',
            'intermediate_sizes',
            'jpeg_recompression',
            'optimizer_detected',
            'cdn_transformations'
        ];

        if (!$reason || !is_string($reason)) {
            return 'optimizer_detected';
        }

        $reason = sanitize_text_field($reason);

        if (!in_array($reason, $allowed_reasons)) {
            return 'optimizer_detected';
        }

        return $reason;
    }

    /**
     * SECURITY: Update policy options with validation
     */
    private static function updatePolicyOptions($reason) {
        try {
            // SECURITY: Update remote-only mode
            $result1 = update_option('c2c_remote_only', true, false);
            
            // SECURITY: Update enforced reason
            $result2 = update_option('c2c_enforced_reason', $reason, false);
            
            // SECURITY: Update enforced timestamp
            $result3 = update_option('c2c_enforced_at', current_time('mysql'), false);

            if (!$result1 || !$result2 || !$result3) {
                throw new Exception('Failed to update policy options');
            }

        } catch (Exception $e) {
            error_log('C2C: Error updating policy options: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * SECURITY: Trigger retro-sign with validation
     */
    private static function triggerRetroSignSecure() {
        try {
            // SECURITY: Check if RetroSign class exists
            if (!class_exists('C2C\RetroSign')) {
                error_log('C2C: RetroSign class not available');
                return;
            }

            // SECURITY: Check if trigger method exists
            if (!method_exists('C2C\RetroSign', 'triggerEmergencyRetroSign')) {
                error_log('C2C: RetroSign trigger method not available');
                return;
            }

            // SECURITY: Call retro-sign with error handling
            RetroSign::triggerEmergencyRetroSign();

        } catch (Exception $e) {
            error_log('C2C: Error triggering retro-sign: ' . $e->getMessage());
        }
    }
        }

        return false;
    }

    /**
     * Detect excessive intermediate sizes
     */
    private static function detectExcessiveIntermediateSizes($attachment_id) {
        $metadata = wp_get_attachment_metadata($attachment_id);
        
        if (!isset($metadata['sizes']) || !is_array($metadata['sizes'])) {
            return false;
        }

        $intermediate_sizes = array_keys($metadata['sizes']);
        $standard_sizes = ['thumbnail', 'medium', 'medium_large', 'large'];
        
        // Count non-standard sizes
        $extra_sizes = array_diff($intermediate_sizes, $standard_sizes);
        
        // If more than 3 extra sizes, consider it excessive
        return count($extra_sizes) > 3;
    }

    /**
     * Detect JPEG quality reduction
     */
    private static function detectJpegRecompression($attachment_id) {
        $mime_type = get_post_mime_type($attachment_id);
        if ($mime_type !== 'image/jpeg') {
            return false;
        }

        // Check JPEG quality settings
        $jpeg_quality = get_option('jpeg_quality', 82);
        
        // Also check for editor quality filters
        $editor_quality = apply_filters('jpeg_quality', 82, 'image_resize');
        
        // If quality is less than 100, compression is active
        return $jpeg_quality < 100 || $editor_quality < 100;
    }

    /**
     * Detect known optimizer plugins
     */
    private static function detectOptimizerPlugins() {
        $active_plugins = get_option('active_plugins', []);
        $optimizer_plugins = [
            'ewww-image-optimizer/ewww-image-optimizer.php',
            'smush-pro-wp/smush-pro.php',
            'wp-smushit/wp-smush.php',
            'imagify/imagify.php',
            'tiny-compress-images/tiny-compress-images.php',
            'shortpixel-image-optimiser/wp-shortpixel.php',
            'optimole-wp/optimole-wp.php',
            'webp-express/webp-express.php',
        ];

        foreach ($optimizer_plugins as $plugin) {
            if (in_array($plugin, $active_plugins)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Detect CDN transformations
     */
    private static function detectCdnTransformations() {
        // Check for CDN plugins
        $active_plugins = get_option('active_plugins', []);
        $cdn_plugins = [
            'wp-super-cache/wp-cache.php',
            'w3-total-cache/w3-total-cache.php',
            'wp-rocket/wp-rocket.php',
            'cloudflare/cloudflare.php',
        ];

        foreach ($cdn_plugins as $plugin) {
            if (in_array($plugin, $active_plugins)) {
                return true;
            }
        }

        // Check for CDN constants
        if (defined('WP_ROCKET_SLUG') || defined('W3TC')) {
            return true;
        }

        return false;
    }

    /**
     * Hook: wp_generate_attachment_metadata - analyze image processing
     */
    public static function onImageProcessing($metadata, $attachment_id) {
        // Schedule optimizer check for after processing is complete
        wp_schedule_single_event(time() + 5, 'c2c_check_optimizer', [$attachment_id]);
        
        return $metadata;
    }

    /**
     * Hook: intermediate_image_sizes_advanced - track size generation
     */
    public static function onIntermediateSizes($sizes, $metadata, $attachment_id) {
        // Store the sizes being generated for analysis
        update_post_meta($attachment_id, '_c2c_generating_sizes', array_keys($sizes));
        
        return $sizes;
    }

    /**
     * Trigger retro-sign for recent attachments
     */
    private static function triggerRetroSign() {
        // Schedule immediate retro-sign for last 50 attachments
        wp_schedule_single_event(time(), 'c2c_emergency_retro_sign', [50]);
    }

    /**
     * Run comprehensive optimizer check
     */
    public static function runComprehensiveCheck() {
        $results = [
            'big_image_scaling' => self::detectBigImageScalingActive(),
            'intermediate_sizes' => self::detectExcessiveSizesActive(),
            'jpeg_recompression' => self::detectJpegCompressionActive(),
            'optimizer_plugins' => self::detectOptimizerPlugins(),
            'cdn_transformations' => self::detectCdnTransformations(),
        ];

        $any_detected = array_filter($results);
        
        if (!empty($any_detected)) {
            $detected_reasons = array_keys($any_detected);
            $primary_reason = $detected_reasons[0];
            
            update_option('c2c_remote_only', true);
            update_option('c2c_enforced_reason', $primary_reason);
            update_option('c2c_enforced_at', current_time('mysql'));
            update_option('c2c_detection_details', $results);
            
            error_log("C2C: Remote-only enforced due to: " . $primary_reason);
            error_log("C2C: Detection details: " . json_encode($results));
            
            return true;
        }

        return false;
    }

    /**
     * Check if big image scaling is active
     */
    private static function detectBigImageScalingActive() {
        $threshold = get_option('big_image_size_threshold', 2560);
        return $threshold !== false && $threshold > 0;
    }

    /**
     * Check if excessive intermediate sizes are configured
     */
    private static function detectExcessiveSizesActive() {
        $sizes = get_intermediate_image_sizes();
        $standard_sizes = ['thumbnail', 'medium', 'medium_large', 'large'];
        $extra_sizes = array_diff($sizes, $standard_sizes);
        return count($extra_sizes) > 3;
    }

    /**
     * Check if JPEG compression is active
     */
    private static function detectJpegCompressionActive() {
        $jpeg_quality = get_option('jpeg_quality', 82);
        $editor_quality = apply_filters('jpeg_quality', 82, 'image_resize');
        return $jpeg_quality < 100 || $editor_quality < 100;
    }
}

// Schedule hooks
add_action('c2c_check_optimizer', ['C2C\\OptimizerDetector', 'checkAttachment'], 10, 1);
add_action('c2c_emergency_retro_sign', ['C2C\\RetroSign', 'emergencyRetroSign'], 10, 1);
