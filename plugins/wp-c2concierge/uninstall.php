<?php
/**
 * C2 Concierge Plugin Uninstall
 * SECURITY: Enhanced uninstall with comprehensive validation
 * Clean uninstall - removes all plugin data without breaking content
 */

// SECURITY: Prevent direct access outside WordPress uninstall context
if (!defined('WP_UNINSTALL_PLUGIN')) {
    // SECURITY: Log unauthorized access attempt
    error_log('C2C: Unauthorized uninstall access attempt from ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    exit;
}

// SECURITY: Additional security checks
try {
    // SECURITY: Verify WordPress is fully loaded
    if (!function_exists('wp_verify_nonce')) {
        throw new Exception('WordPress not properly loaded for uninstall');
    }
    
    // SECURITY: Check if we're in CLI or admin context
    if (!defined('WP_CLI') && !is_admin()) {
        throw new Exception('Uninstall must be run from admin context or WP CLI');
    }
    
    // SECURITY: Validate plugin file path
    $plugin_file = plugin_basename(__FILE__);
    if (strpos($plugin_file, 'wp-c2concierge') === false) {
        throw new Exception('Invalid plugin context for uninstall');
    }
    
    // SECURITY: Set execution time limit
    set_time_limit(60);
    
    // SECURITY: Log uninstall start
    error_log('C2C: Starting secure uninstall for ' . $plugin_file);
    
    // SECURITY: Load uninstall class with validation
    $uninstall_file = __DIR__ . '/inc/Uninstall.php';
    if (!file_exists($uninstall_file)) {
        throw new Exception('Uninstall class file not found');
    }
    
    if (!is_readable($uninstall_file)) {
        throw new Exception('Uninstall class file not readable');
    }
    
    require_once $uninstall_file;
    
    // SECURITY: Validate class exists
    if (!class_exists('C2C\Uninstall')) {
        throw new Exception('Uninstall class not found');
    }
    
    // SECURITY: Perform secure cleanup with error handling
    $cleanup_result = C2C\Uninstall::cleanup('uninstall');
    
    if (!$cleanup_result) {
        error_log('C2C: Cleanup failed, attempting emergency cleanup');
        C2C\Uninstall::emergencyCleanup();
    }
    
    // SECURITY: Verify cleanup was successful
    $safety_check = C2C\Uninstall::verifySafety();
    
    if (!$safety_check['safe']) {
        error_log('C2C: Uninstall safety check failed - incomplete cleanup');
        error_log('C2C: Safety check results: ' . json_encode($safety_check));
    } else {
        error_log('C2C: Uninstall completed successfully and safely');
    }
    
} catch (Exception $e) {
    // SECURITY: Log critical errors
    error_log('C2C: Critical uninstall error: ' . $e->getMessage());
    error_log('C2C: Uninstall failed for plugin: ' . ($plugin_file ?? 'unknown'));
    
    // SECURITY: Don't expose error details to user
    // Exit silently to prevent information disclosure
    exit;
}

// SECURITY: Final cleanup
try {
    // SECURITY: Clear any remaining WordPress hooks
    remove_all_actions('c2c_retro_sign_daily');
    remove_all_actions('c2c_emergency_retro_sign');
    remove_all_actions('c2c_check_optimizer');
    
    // SECURITY: Clear any cached data
    wp_cache_flush();
    
} catch (Exception $e) {
    error_log('C2C: Final cleanup error: ' . $e->getMessage());
}

// SECURITY: Successful uninstall completion
error_log('C2C: Plugin uninstall process completed');
