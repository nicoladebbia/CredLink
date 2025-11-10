<?php

namespace C2C;

use Exception;
use WP_Error;

class Uninstall {
    /**
     * SECURITY: Configuration constants
     */
    const MAX_EXECUTION_TIME = 30;
    const MAX_BATCH_SIZE = 1000;
    const MAX_RETRY_ATTEMPTS = 3;
    
    /**
     * SECURITY: Valid uninstall contexts
     */
    const VALID_CONTEXTS = ['uninstall', 'deactivate', 'cleanup'];
    
    /**
     * SECURITY: Initialize uninstall with security validation
     */
    private static function validateUninstallContext($context = 'uninstall') {
        // SECURITY: Validate WordPress context
        if (!function_exists('wp_verify_nonce')) {
            throw new Exception('WordPress context not available for uninstall');
        }
        
        // SECURITY: Validate context parameter
        if (!in_array($context, self::VALID_CONTEXTS, true)) {
            throw new Exception('Invalid uninstall context: ' . $context);
        }
        
        // SECURITY: Check user capabilities
        if (!current_user_can('activate_plugins')) {
            throw new Exception('Insufficient permissions for uninstall operation');
        }
        
        // SECURITY: Validate WordPress database
        global $wpdb;
        if (!$wpdb || !isset($wpdb->postmeta)) {
            throw new Exception('WordPress database not available');
        }
        
        return true;
    }
    
    /**
     * SECURITY: Sanitize option names
     */
    private static function sanitizeOptionName($option) {
        if (!is_string($option) || empty($option)) {
            return false;
        }
        
        // SECURITY: Only allow alphanumeric and underscore
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $option)) {
            return false;
        }
        
        // SECURITY: Prevent SQL injection
        if (strlen($option) > 100) {
            return false;
        }
        
        return $option;
    }
    
    /**
     * SECURITY: Validate meta key
     */
    private static function validateMetaKey($meta_key) {
        if (!is_string($meta_key) || empty($meta_key)) {
            return false;
        }
        
        // SECURITY: Only allow safe characters
        if (!preg_match('/^[a-zA-Z0-9_-]+$/', $meta_key)) {
            return false;
        }
        
        // SECURITY: Prevent SQL injection
        if (strlen($meta_key) > 255) {
            return false;
        }
        
        return $meta_key;
    }
    
    /**
     * SECURITY: Safe cron hook removal
     */
    private static function safeRemoveCronHooks() {
        $cron_hooks = [
            'c2c_retro_sign_daily',
            'c2c_emergency_retro_sign',
            'c2c_check_optimizer'
        ];
        
        foreach ($cron_hooks as $hook) {
            try {
                // SECURITY: Validate hook name
                if (!self::sanitizeOptionName($hook)) {
                    error_log('C2C: Invalid cron hook name: ' . $hook);
                    continue;
                }
                
                // SECURITY: Check if hook exists before clearing
                if (wp_next_scheduled($hook)) {
                    wp_clear_scheduled_hook($hook);
                    error_log('C2C: Removed cron hook: ' . $hook);
                }
            } catch (Exception $e) {
                error_log('C2C: Failed to remove cron hook ' . $hook . ': ' . $e->getMessage());
            }
        }
    }
    
    /**
     * SECURITY: Safe option removal
     */
    private static function safeRemoveOptions() {
        $options = [
            'c2c_tenant_id',
            'c2c_remote_only',
            'c2c_enforced_reason',
            'c2c_enforced_at',
            'c2c_preserved_paths',
            'c2c_show_badges',
            'c2c_retro_sign_days',
            'c2c_last_retro_sign',
            'c2c_detection_details'
        ];
        
        foreach ($options as $option) {
            try {
                // SECURITY: Validate option name
                $sanitized_option = self::sanitizeOptionName($option);
                if (!$sanitized_option) {
                    error_log('C2C: Invalid option name: ' . $option);
                    continue;
                }
                
                // SECURITY: Check if option exists before deleting
                if (get_option($sanitized_option) !== false) {
                    delete_option($sanitized_option);
                    error_log('C2C: Removed option: ' . $sanitized_option);
                }
            } catch (Exception $e) {
                error_log('C2C: Failed to remove option ' . $option . ': ' . $e->getMessage());
            }
        }
    }
    
    /**
     * SECURITY: Safe post meta removal with batching
     */
    private static function safeRemovePostMeta() {
        global $wpdb;
        
        $meta_keys = [
            '_c2_manifest_url',
            '_c2_mode',
            '_c2_signed_at',
            '_c2_generating_sizes'
        ];
        
        foreach ($meta_keys as $meta_key) {
            try {
                // SECURITY: Validate meta key
                $sanitized_key = self::validateMetaKey($meta_key);
                if (!$sanitized_key) {
                    error_log('C2C: Invalid meta key: ' . $meta_key);
                    continue;
                }
                
                // SECURITY: Use prepared statements to prevent SQL injection
                $deleted_count = 0;
                $offset = 0;
                
                do {
                    // SECURITY: Batch deletion to prevent timeouts
                    $result = $wpdb->query($wpdb->prepare(
                        "DELETE FROM {$wpdb->postmeta} 
                         WHERE meta_key = %s 
                         LIMIT %d",
                        $sanitized_key,
                        self::MAX_BATCH_SIZE
                    ));
                    
                    if ($result === false) {
                        error_log('C2C: Database error removing meta key ' . $sanitized_key);
                        break;
                    }
                    
                    $deleted_count += $result;
                    
                    // SECURITY: Prevent infinite loops
                    if ($deleted_count > 10000) {
                        error_log('C2C: Too many meta records for key ' . $sanitized_key);
                        break;
                    }
                    
                } while ($result > 0);
                
                error_log('C2C: Removed ' . $deleted_count . ' meta records for key: ' . $sanitized_key);
                
            } catch (Exception $e) {
                error_log('C2C: Failed to remove post meta ' . $meta_key . ': ' . $e->getMessage());
            }
        }
    }
    
    /**
     * SECURITY: Safe transient removal
     */
    private static function safeRemoveTransients() {
        $transients = [
            'c2c_survival_test_results',
            'c2c_optimizer_check_cache',
            'c2c_sign_endpoint_cache'
        ];
        
        foreach ($transients as $transient) {
            try {
                // SECURITY: Validate transient name
                $sanitized_transient = self::sanitizeOptionName($transient);
                if (!$sanitized_transient) {
                    error_log('C2C: Invalid transient name: ' . $transient);
                    continue;
                }
                
                // SECURITY: Check if transient exists before deleting
                if (get_transient($sanitized_transient) !== false) {
                    delete_transient($sanitized_transient);
                    error_log('C2C: Removed transient: ' . $sanitized_transient);
                }
            } catch (Exception $e) {
                error_log('C2C: Failed to remove transient ' . $transient . ': ' . $e->getMessage());
            }
        }
    }
    
    /**
     * SECURITY: Clean uninstall with comprehensive security
     */
    public static function cleanup($context = 'uninstall') {
        try {
            // SECURITY: Validate uninstall context
            self::validateUninstallContext($context);
            
            // SECURITY: Set execution time limit
            $start_time = time();
            set_time_limit(self::MAX_EXECUTION_TIME);
            
            error_log('C2C: Starting secure uninstall cleanup');
            
            // SECURITY: Remove components with error handling
            self::safeRemoveCronHooks();
            self::safeRemoveOptions();
            self::safeRemovePostMeta();
            self::safeRemoveTransients();
            
            // SECURITY: Log completion with execution time
            $execution_time = time() - $start_time;
            error_log('C2C: Secure uninstall completed in ' . $execution_time . ' seconds');
            
            return true;
            
        } catch (Exception $e) {
            error_log('C2C: Uninstall failed: ' . $e->getMessage());
            return false;
        }
    }
    
    /**
     * SECURITY: Verify uninstall safety with comprehensive checks
     */
    public static function verifySafety() {
        try {
            // SECURITY: Validate WordPress context
            self::validateUninstallContext('verify');
            
            global $wpdb;
            
            // SECURITY: Use prepared statements for all queries
            $broken_posts = 0;
            $remaining_options = 0;
            $remaining_meta = 0;
            
            // SECURITY: Check broken posts with safe query
            $broken_posts_result = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) 
                 FROM {$wpdb->posts} 
                 WHERE post_content LIKE %s 
                 OR post_content LIKE %s",
                '%[c2-badge%',
                '%[credlink%'
            ));
            
            if ($broken_posts_result !== null) {
                $broken_posts = (int)$broken_posts_result;
            }
            
            // SECURITY: Check remaining options with safe query
            $remaining_options_result = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) 
                 FROM {$wpdb->options} 
                 WHERE option_name LIKE %s",
                'c2c_%'
            ));
            
            if ($remaining_options_result !== null) {
                $remaining_options = (int)$remaining_options_result;
            }
            
            // SECURITY: Check remaining meta with safe query
            $remaining_meta_result = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) 
                 FROM {$wpdb->postmeta} 
                 WHERE meta_key LIKE %s",
                '_c2_%'
            ));
            
            if ($remaining_meta_result !== null) {
                $remaining_meta = (int)$remaining_meta_result;
            }
            
            // SECURITY: Validate results
            $broken_posts = max(0, $broken_posts);
            $remaining_options = max(0, $remaining_options);
            $remaining_meta = max(0, $remaining_meta);
            
            $is_safe = ($broken_posts == 0 && $remaining_options == 0 && $remaining_meta == 0);
            
            error_log('C2C: Safety verification - Broken posts: ' . $broken_posts . 
                     ', Options: ' . $remaining_options . 
                     ', Meta: ' . $remaining_meta . 
                     ', Safe: ' . ($is_safe ? 'YES' : 'NO'));
            
            return [
                'broken_posts' => $broken_posts,
                'remaining_options' => $remaining_options,
                'remaining_meta' => $remaining_meta,
                'safe' => $is_safe,
                'timestamp' => current_time('mysql')
            ];
            
        } catch (Exception $e) {
            error_log('C2C: Safety verification failed: ' . $e->getMessage());
            return [
                'broken_posts' => -1,
                'remaining_options' => -1,
                'remaining_meta' => -1,
                'safe' => false,
                'error' => $e->getMessage(),
                'timestamp' => current_time('mysql')
            ];
        }
    }
    
    /**
     * SECURITY: Emergency cleanup for failed uninstall
     */
    public static function emergencyCleanup() {
        try {
            error_log('C2C: Starting emergency cleanup');
            
            // SECURITY: Force cleanup without validation
            self::safeRemoveCronHooks();
            self::safeRemoveOptions();
            self::safeRemovePostMeta();
            self::safeRemoveTransients();
            
            error_log('C2C: Emergency cleanup completed');
            return true;
            
        } catch (Exception $e) {
            error_log('C2C: Emergency cleanup failed: ' . $e->getMessage());
            return false;
        }
    }
}
