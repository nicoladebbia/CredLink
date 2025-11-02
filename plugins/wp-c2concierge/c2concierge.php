<?php
/**
 * Plugin Name: C2 Concierge — Content Credentials
 * Description: Signs uploads, injects remote C2PA manifests, and adds a verify badge.
 * Version: 0.1.0
 * Author: C2 Concierge Team
 * License: MIT
 * Network: true
 * Text Domain: c2-concierge
 * Domain Path: /languages
 * Requires at least: 5.0
 * Requires PHP: 7.4
 */

// SECURITY: Exit if accessed directly
if (!defined('ABSPATH')) {
    exit('Direct access forbidden.');
}

// SECURITY: Validate PHP version
if (version_compare(PHP_VERSION, '7.4.0', '<')) {
    exit('C2 Concierge requires PHP 7.4 or higher.');
}

// SECURITY: Validate WordPress version
if (version_compare($GLOBALS['wp_version'], '5.0.0', '<')) {
    exit('C2 Concierge requires WordPress 5.0 or higher.');
}

// SECURITY: Define constants with validation
if (!defined('C2C_VERSION')) {
    define('C2C_VERSION', '0.1.0');
}

if (!defined('C2C_PLUGIN_DIR')) {
    define('C2C_PLUGIN_DIR', plugin_dir_path(__FILE__));
}

if (!defined('C2C_PLUGIN_URL')) {
    define('C2C_PLUGIN_URL', plugin_dir_url(__FILE__));
}

if (!defined('C2C_PLUGIN_BASENAME')) {
    define('C2C_PLUGIN_BASENAME', plugin_basename(__FILE__));
}

// SECURITY: Validate plugin directory exists
if (!is_dir(C2C_PLUGIN_DIR)) {
    exit('Plugin directory validation failed.');
}

// SECURITY: Validate plugin URL
if (!filter_var(C2C_PLUGIN_URL, FILTER_VALIDATE_URL)) {
    exit('Plugin URL validation failed.');
}

// SECURITY: Load required files with existence checks
$required_files = [
    'inc/Injector.php',
    'inc/Admin.php',
    'inc/OptimizerDetector.php',
    'inc/RetroSign.php',
    'inc/Uninstall.php'
];

foreach ($required_files as $file) {
    $file_path = C2C_PLUGIN_DIR . $file;
    if (!file_exists($file_path)) {
        error_log("C2C: Required file missing: {$file}");
        continue; // Continue rather than exit to allow partial functionality
    }
    require_once $file_path;
}

// SECURITY: Validate class existence before using
$core_classes = [
    'C2C\Injector',
    'C2C\Admin',
    'C2C\OptimizerDetector',
    'C2C\RetroSign'
];

foreach ($core_classes as $class) {
    if (!class_exists($class)) {
        error_log("C2C: Required class missing: {$class}");
        continue;
    }
}

// SECURITY: Plugin lifecycle hooks with error handling
register_activation_hook(__FILE__, function() {
    try {
        if (class_exists('C2C\RetroSign')) {
            C2C\RetroSign::activate();
        }
    } catch (Exception $e) {
        error_log('C2C: Activation error: ' . $e->getMessage());
        wp_die('Plugin activation failed. Please check error logs.');
    }
});

register_deactivation_hook(__FILE__, function() {
    try {
        if (class_exists('C2C\RetroSign')) {
            C2C\RetroSign::deactivate();
        }
    } catch (Exception $e) {
        error_log('C2C: Deactivation error: ' . $e->getMessage());
    }
});

// SECURITY: Core WordPress hooks with validation
if (class_exists('C2C\Injector')) {
    add_action('add_attachment', ['C2C\Injector', 'onAddAttachment'], 10, 1);
    add_filter('wp_get_attachment_image_attributes', ['C2C\Injector', 'imgAttrs'], 10, 3);
    add_filter('the_content', ['C2C\Injector', 'filterContent'], 9, 1);
    add_action('wp_head', ['C2C\Injector', 'emitHeadLinks'], 99);
}

// SECURITY: Admin hooks with capability validation
if (class_exists('C2C\Admin') && is_admin()) {
    add_action('admin_notices', ['C2C\Admin', 'maybeBanner']);
    add_action('admin_menu', ['C2C\Admin', 'addSettingsPage']);
    add_action('admin_init', ['C2C\Admin', 'registerSettings']);
}

// SECURITY: Initialize plugin with error handling
function c2c_initialize_plugin() {
    try {
        // SECURITY: Memory limit check
        if (ini_get('memory_limit') !== '-1' && 
            (int)ini_get('memory_limit') < 128 * 1024 * 1024) {
            error_log('C2C: Warning - Low memory limit detected');
        }

        // SECURITY: Execution time check
        $max_execution_time = ini_get('max_execution_time');
        if ($max_execution_time !== '0' && (int)$max_execution_time < 30) {
            error_log('C2C: Warning - Low execution time limit detected');
        }

        // SECURITY: Initialize core classes
        if (class_exists('C2C\Injector')) {
            C2C\Injector::init();
        }
        
        if (class_exists('C2C\Admin')) {
            C2C\Admin::init();
        }
        
        if (class_exists('C2C\OptimizerDetector')) {
            C2C\OptimizerDetector::init();
        }
        
        if (class_exists('C2C\RetroSign')) {
            C2C\RetroSign::init();
        }

        // SECURITY: Log successful initialization
        error_log('C2C: Plugin initialized successfully - v' . C2C_VERSION);

    } catch (Exception $e) {
        error_log('C2C: Initialization error: ' . $e->getMessage());
        // SECURITY: Don't expose error details to user
        add_action('admin_notices', function() {
            echo '<div class="notice notice-error"><p>C2 Concierge initialization failed. Please check error logs.</p></div>';
        });
    }
}

// SECURITY: Initialize at appropriate hook priority
add_action('plugins_loaded', 'c2c_initialize_plugin', 10);

// SECURITY: Add security headers
add_action('send_headers', function() {
    if (!headers_sent()) {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('X-XSS-Protection: "1; mode=block"');
        header('Referrer-Policy: strict-origin-when-cross-origin');
    }
});

// SECURITY: Add uninstall hook
register_uninstall_hook(__FILE__, function() {
    try {
        if (class_exists('C2C\Uninstall')) {
            C2C\Uninstall::cleanup();
        }
    } catch (Exception $e) {
        error_log('C2C: Uninstall error: ' . $e->getMessage());
    }
});

// SECURITY: Add compatibility check
function c2c_compatibility_check() {
    $errors = [];
    
    // Check required functions
    $required_functions = [
        'wp_get_attachment_url',
        'get_post_meta',
        'update_post_meta',
        'add_option',
        'get_option',
        'wp_schedule_event',
        'wp_clear_scheduled_hook'
    ];
    
    foreach ($required_functions as $function) {
        if (!function_exists($function)) {
            $errors[] = "Required WordPress function missing: {$function}";
        }
    }
    
    if (!empty($errors)) {
        error_log('C2C: Compatibility check failed: ' . implode(', ', $errors));
        return false;
    }
    
    return true;
}

// SECURITY: Run compatibility check
if (!c2c_compatibility_check()) {
    add_action('admin_notices', function() {
        echo '<div class="notice notice-error"><p>C2 Concierge: WordPress compatibility check failed. Please update WordPress.</p></div>';
    });
}
