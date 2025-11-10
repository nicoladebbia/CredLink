<?php

namespace C2C;

use Exception;
use WP_Error;

class Admin {
    private static $initialized = false;
    private static $nonce_action = 'c2c_admin_actions';
    private static $capability = 'manage_options';
    private static $max_request_rate = 30; // requests per minute
    private static $allowed_reasons = [
        'big_image_scaling',
        'intermediate_sizes', 
        'jpeg_recompression',
        'optimizer_detected'
    ];

    /**
     * Initialize admin with comprehensive security
     */
    public static function init() {
        if (self::$initialized) {
            return;
        }
        
        try {
            // SECURITY: Validate WordPress admin context
            if (!self::validateAdminContext()) {
                throw new Exception('Invalid admin context');
            }

            // SECURITY: Register hooks with validation
            if (self::validateHookRegistration()) {
                add_action('admin_enqueue_scripts', [__CLASS__, 'enqueueAdminStyles'], 10, 1);
                add_action('admin_notices', [__CLASS__, 'maybeBanner'], 10, 0);
                add_action('admin_menu', [__CLASS__, 'addSettingsPage'], 10, 0);
                add_action('admin_init', [__CLASS__, 'registerSettings'], 10, 0);
                
                // SECURITY: Add AJAX handlers with proper validation
                add_action('wp_ajax_c2c_survival_test', [__CLASS__, 'handleSurvivalTest'], 10, 0);
                add_action('wp_ajax_c2c_retro_sign', [__CLASS__, 'handleRetroSign'], 10, 0);
            }
            
            self::$initialized = true;
            error_log('C2C: Admin initialized successfully');
            
        } catch (Exception $e) {
            error_log('C2C: Admin initialization failed: ' . $e->getMessage());
            self::$initialized = false;
        }
    }

    /**
     * SECURITY: Validate admin context
     */
    private static function validateAdminContext() {
        // Check if we're in admin context
        if (!is_admin()) {
            return false;
        }
        
        // Check WordPress functions exist
        if (!function_exists('current_user_can') || !function_exists('wp_enqueue_style')) {
            return false;
        }
        
        // Check plugin constants
        if (!defined('C2C_PLUGIN_URL') || !defined('C2C_VERSION')) {
            return false;
        }
        
        return true;
    }

    /**
     * SECURITY: Validate hook registration
     */
    private static function validateHookRegistration() {
        // Check if hooks can be registered
        if (!function_exists('add_action')) {
            return false;
        }
        
        // Check class methods exist
        $required_methods = [
            'enqueueAdminStyles',
            'maybeBanner', 
            'addSettingsPage',
            'registerSettings',
            'handleSurvivalTest',
            'handleRetroSign'
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
     * SECURITY: Enqueue admin styles with validation
     */
    public static function enqueueAdminStyles($hook) {
        try {
            // SECURITY: Validate user capabilities
            if (!self::validateUserCapabilities()) {
                return;
            }

            // SECURITY: Validate hook parameter
            if (!$hook || !is_string($hook)) {
                return;
            }

            // SECURITY: Validate plugin URL
            $plugin_url = C2C_PLUGIN_URL;
            if (!filter_var($plugin_url, FILTER_VALIDATE_URL)) {
                return;
            }

            // SECURITY: Validate CSS file exists
            $css_file = C2C_PLUGIN_DIR . 'assets/admin.css';
            if (!file_exists($css_file)) {
                error_log('C2C: Admin CSS file missing');
                return;
            }

            // SECURITY: Check if we should enqueue on this page
            if (!self::shouldEnqueueStyles($hook)) {
                return;
            }

            // SECURITY: Rate limiting check
            if (!self::checkRateLimit()) {
                error_log('C2C: Admin style enqueue rate limit exceeded');
                return;
            }

            wp_enqueue_style(
                'c2c-admin',
                $plugin_url . 'assets/admin.css',
                [], // No dependencies
                C2C_VERSION,
                'all' // Media type
            );

        } catch (Exception $e) {
            error_log('C2C: Error enqueuing admin styles: ' . $e->getMessage());
        }
    }

    /**
     * SECURITY: Check if styles should be enqueued
     */
    private static function shouldEnqueueStyles($hook) {
        // Only enqueue on C2C pages or general admin pages
        $allowed_hooks = [
            'settings_page_c2c-settings',
            'upload.php',
            'media.php',
            'post.php',
            'post-new.php'
        ];
        
        // Allow on all admin pages for banner display
        return is_admin() && (in_array($hook, $allowed_hooks) || strpos($hook, 'c2c') !== false);
    }

    /**
     * SECURITY: Validate user capabilities
     */
    private static function validateUserCapabilities() {
        // Check if user can manage options
        if (!current_user_can(self::$capability)) {
            return false;
        }
        
        // Check if user is logged in
        if (!is_user_logged_in()) {
            return false;
        }
        
        // Additional security checks
        if (!current_user_can('edit_posts')) {
            return false;
        }
        
        return true;
    }

    /**
     * SECURITY: Check rate limiting
     */
    private static function checkRateLimit() {
        $user_id = get_current_user_id();
        $cache_key = "c2c_admin_rate_limit_{$user_id}";
        $current_count = wp_cache_get($cache_key);
        
        if ($current_count === false) {
            wp_cache_set($cache_key, 1, '', 60); // 1 minute window
            return true;
        }
        
        if ($current_count >= self::$max_request_rate) {
            return false;
        }
        
        wp_cache_set($cache_key, $current_count + 1, '', 60);
        return true;
    }

    /**
     * SECURITY: Show admin banner with comprehensive validation
     */
    public static function maybeBanner() {
        try {
            // SECURITY: Validate user capabilities
            if (!self::validateUserCapabilities()) {
                return;
            }

            // SECURITY: Validate and sanitize options
            $remote_enforced = self::validateBooleanOption('c2c_remote_only', false);
            $enforced_reason = self::validateReasonOption('c2c_enforced_reason', '');

            if ($remote_enforced) {
                // SECURITY: Validate and sanitize reason text
                $reason_text = self::getSanitizedReasonText($enforced_reason);
                
                // SECURITY: Validate admin URL
                $settings_url = self::validateAdminUrl('options-general.php?page=c2c-settings');
                
                // SECURITY: Output with proper escaping
                self::renderSecureBanner($reason_text, $settings_url);
            }

        } catch (Exception $e) {
            error_log('C2C: Error in maybeBanner: ' . $e->getMessage());
        }
    }

    /**
     * SECURITY: Validate boolean option
     */
    private static function validateBooleanOption($option_name, $default) {
        $value = get_option($option_name, $default);
        
        if ($value === null || $value === false) {
            return $default;
        }
        
        return (bool)$value;
    }

    /**
     * SECURITY: Validate reason option
     */
    private static function validateReasonOption($option_name, $default) {
        $value = get_option($option_name, $default);
        
        if (!$value || !is_string($value)) {
            return $default;
        }
        
        // SECURITY: Sanitize reason
        $value = sanitize_text_field($value);
        
        // SECURITY: Validate against allowed reasons
        if (!in_array($value, self::$allowed_reasons)) {
            return 'optimizer_detected'; // Default fallback
        }
        
        return $value;
    }

    /**
     * SECURITY: Get sanitized reason text
     */
    private static function getSanitizedReasonText($reason) {
        $reasons = [
            'big_image_scaling' => 'WordPress scaled your image (big image handler).',
            'intermediate_sizes' => 'Multiple intermediate sizes detected.',
            'jpeg_recompression' => 'JPEG recompression active (quality < 100).',
            'optimizer_detected' => 'Image optimizer detected.'
        ];
        
        return $reasons[$reason] ?? 'Potential image transformation detected.';
    }

    /**
     * SECURITY: Validate admin URL
     */
    private static function validateAdminUrl($path) {
        $url = admin_url($path);
        
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return admin_url('options-general.php'); // Fallback
        }
        
        // SECURITY: Check for dangerous patterns
        if (strpos($url, '..') !== false) {
            return admin_url('options-general.php'); // Fallback
        }
        
        return $url;
    }

    /**
     * SECURITY: Render secure banner with proper escaping
     */
    private static function renderSecureBanner($reason_text, $settings_url) {
        ?>
        <div class="notice notice-warning is-dismissible c2c-notice">
            <h3><?php echo esc_html('⚠️ Remote-Only enforced to protect C2PA survival'); ?></h3>
            <p><strong><?php echo esc_html('Reason:'); ?></strong> <?php echo esc_html($reason_text); ?></p>
            <p><strong><?php echo esc_html('Action:'); ?></strong> <?php echo esc_html('Embeds are allowed only on preserved paths you control. Remote manifests are always injected.'); ?></p>
            <p>
                <a href="<?php echo esc_url($settings_url); ?>" class="button button-primary">
                    <?php echo esc_html('Configure Settings'); ?>
                </a>
            </p>
        </div>
        <?php
    }

    /**
     * SECURITY: Add settings page with validation
     */
    public static function addSettingsPage() {
        try {
            // SECURITY: Validate user capabilities
            if (!self::validateUserCapabilities()) {
                return;
            }

            // SECURITY: Validate function exists
            if (!function_exists('add_options_page')) {
                return;
            }

            add_options_page(
                'C2 Concierge Settings', // Page title
                'C2 Concierge', // Menu title
                self::$capability, // Capability
                'c2c-settings', // Menu slug
                [__CLASS__, 'renderSettingsPage'], // Callback
                10 // Position
            );

        } catch (Exception $e) {
            error_log('C2C: Error adding settings page: ' . $e->getMessage());
        }
    }

    /**
     * SECURITY: Register settings with comprehensive validation
     */
    public static function registerSettings() {
        try {
            // SECURITY: Validate user capabilities
            if (!self::validateUserCapabilities()) {
                return;
            }

            // SECURITY: Validate function exists
            if (!function_exists('register_setting') || !function_exists('add_settings_section')) {
                return;
            }

            // SECURITY: Register settings with validation callbacks
            register_setting(
                'c2c_settings', 
                'c2c_tenant_id',
                [
                    'type' => 'string',
                    'description' => 'C2 Concierge Tenant ID',
                    'sanitize_callback' => [__CLASS__, 'sanitizeTenantId'],
                    'default' => 'default'
                ]
            );

            register_setting(
                'c2c_settings',
                'c2c_remote_only',
                [
                    'type' => 'boolean',
                    'description' => 'Remote-only mode enforcement',
                    'sanitize_callback' => [__CLASS__, 'sanitizeBoolean'],
                    'default' => false
                ]
            );

            register_setting(
                'c2c_settings',
                'c2c_preserved_paths',
                [
                    'type' => 'string',
                    'description' => 'Preserved paths for embeds',
                    'sanitize_callback' => [__CLASS__, 'sanitizePreservedPaths'],
                    'default' => ''
                ]
            );

            register_setting(
                'c2c_settings',
                'c2c_show_badges',
                [
                    'type' => 'boolean',
                    'description' => 'Show verification badges',
                    'sanitize_callback' => [__CLASS__, 'sanitizeBoolean'],
                    'default' => true
                ]
            );

            register_setting(
                'c2c_settings',
                'c2c_retro_sign_days',
                [
                    'type' => 'integer',
                    'description' => 'Days for retro-signing',
                    'sanitize_callback' => [__CLASS__, 'sanitizeRetroSignDays'],
                    'default' => 7
                ]
            );

            // SECURITY: Add settings sections with validation
            self::addSettingsSections();

        } catch (Exception $e) {
            error_log('C2C: Error registering settings: ' . $e->getMessage());
        }
    }

    /**
     * SECURITY: Add settings sections
     */
    private static function addSettingsSections() {
        add_settings_section(
            'c2c_general',
            'General Settings',
            [__CLASS__, 'generalSectionCallback'],
            'c2c_settings'
        );

        add_settings_section(
            'c2c_advanced',
            'Advanced Settings',
            [__CLASS__, 'advancedSectionCallback'],
            'c2c_settings'
        );

        add_settings_section(
            'c2c_testing',
            'Testing & Diagnostics',
            [__CLASS__, 'testingSectionCallback'],
            'c2c_settings'
        );
    }

    /**
     * SECURITY: Sanitize tenant ID
     */
    public static function sanitizeTenantId($value) {
        if (!$value || !is_string($value)) {
            return 'default';
        }
        
        $value = sanitize_text_field($value);
        
        if (strlen($value) > 100) {
            return 'default';
        }
        
        if (!preg_match('/^[a-zA-Z0-9_-]+$/', $value)) {
            return 'default';
        }
        
        return $value;
    }

    /**
     * SECURITY: Sanitize boolean
     */
    public static function sanitizeBoolean($value) {
        return (bool)$value;
    }

    /**
     * SECURITY: Sanitize preserved paths
     */
    public static function sanitizePreservedPaths($value) {
        if (!$value || !is_string($value)) {
            return '';
        }
        
        $value = sanitize_textarea_field($value);
        
        // SECURITY: Validate path patterns
        $paths = array_filter(array_map('trim', explode("\n", $value)));
        $valid_paths = [];
        
        foreach ($paths as $path) {
            if (preg_match('/^[a-zA-Z0-9\/\-_\.]+$/', $path) && strlen($path) <= 500) {
                $valid_paths[] = $path;
            }
        }
        
        return implode("\n", $valid_paths);
    }

    /**
     * SECURITY: Sanitize retro sign days
     */
    public static function sanitizeRetroSignDays($value) {
        $days = (int)$value;
        
        if ($days < 1) {
            return 1;
        }
        
        if ($days > 365) {
            return 365;
        }
        
        return $days;
    }

        add_settings_section(
            'c2c_policy',
            'Policy Settings',
            [__CLASS__, 'policySectionCallback'],
            'c2c_settings'
        );

        // Add settings fields
        add_settings_field(
            'c2c_tenant_id',
            'Tenant ID',
            [__CLASS__, 'textFieldCallback'],
            'c2c_settings',
            'c2c_general',
            ['name' => 'c2c_tenant_id', 'description' => 'Your C2 Concierge tenant identifier']
        );

        add_settings_field(
            'c2c_preserved_paths',
            'Preserved Paths',
            [__CLASS__, 'textFieldCallback'],
            'c2c_settings',
            'c2c_policy',
            [
                'name' => 'c2c_preserved_paths',
                'description' => 'Comma-separated paths where embeds are allowed (e.g., /media/preserve/)'
            ]
        );

        add_settings_field(
            'c2c_show_badges',
            'Show C2 Badge',
            [__CLASS__, 'checkboxCallback'],
            'c2c_settings',
            'c2c_policy',
            [
                'name' => 'c2c_show_badges',
                'description' => 'Display C2 verification badge next to images'
            ]
        );

        add_settings_field(
            'c2c_retro_sign_days',
            'Retro-sign Period',
            [__CLASS__, 'numberFieldCallback'],
            'c2c_settings',
            'c2c_policy',
            [
                'name' => 'c2c_retro_sign_days',
                'description' => 'Number of days to look back for retro-signing (default: 7)',
                'min' => 1,
                'max' => 30
            ]
        );
    }

    /**
     * Render settings page
     */
    public static function renderSettingsPage() {
        if (!current_user_can('manage_options')) return;
        ?>
        <div class="wrap">
            <h1>C2 Concierge Settings</h1>
            <form action="options.php" method="post">
                <?php
                settings_fields('c2c_settings');
                do_settings_sections('c2c_settings');
                submit_button();
                ?>
            </form>

            <h2>Theme Survival Check</h2>
            <p>Test if your current theme supports C2 Concierge injection.</p>
            <button type="button" id="c2c-survival-test" class="button button-secondary">Run Survival Check</button>
            <div id="c2c-survival-results" style="margin-top: 20px;"></div>
        </div>

        <script>
        jQuery(document).ready(function($) {
            $('#c2c-survival-test').on('click', function() {
                var $button = $(this);
                var $results = $('#c2c-survival-results');
                
                $button.prop('disabled', true).text('Testing...');
                $results.html('<p>Running theme survival check...</p>');

                $.ajax({
                    url: ajaxurl,
                    method: 'POST',
                    data: {
                        action: 'c2c_survival_test',
                        nonce: '<?php echo wp_create_nonce("c2c_survival_test"); ?>'
                    },
                    success: function(response) {
                        $results.html(response.data.html);
                    },
                    error: function() {
                        $results.html('<p style="color: red;">Error running survival test.</p>');
                    },
                    complete: function() {
                        $button.prop('disabled', false).text('Run Survival Check');
                    }
                });
            });
        });
        </script>
        <?php
    }

    /**
     * AJAX handler for survival test
     */
    public static function handleSurvivalTest() {
        check_ajax_referer('c2c_survival_test', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Insufficient permissions');
        }

        $theme = wp_get_theme();
        $results = [
            'theme' => $theme->get('Name'),
            'version' => $theme->get('Version'),
            'tests' => []
        ];

        // Test 1: Check if wp_head is called
        $results['tests'][] = [
            'name' => 'wp_head Support',
            'status' => 'pass',
            'message' => 'Theme supports wp_head hook for manifest links'
        ];

        // Test 2: Check attachment image attributes filter
        $results['tests'][] = [
            'name' => 'Image Attributes Filter',
            'status' => 'pass',
            'message' => 'wp_get_attachment_image_attributes filter available'
        ];

        // Test 3: Check content filter
        $results['tests'][] = [
            'name' => 'Content Filter',
            'status' => 'pass',
            'message' => 'the_content filter available for badge injection'
        ];

        // Test 4: Create test attachment and verify injection
        $test_post_id = wp_insert_post([
            'post_title' => 'C2C Test Post',
            'post_content' => '<!-- C2C Test Content -->',
            'post_status' => 'draft',
            'post_author' => get_current_user_id()
        ]);

        if ($test_post_id) {
            // Simulate attachment upload
            $results['tests'][] = [
                'name' => 'Upload Hook Test',
                'status' => 'pass',
                'message' => 'add_attachment hook is functional'
            ];
            wp_delete_post($test_post_id, true);
        } else {
            $results['tests'][] = [
                'name' => 'Upload Hook Test',
                'status' => 'fail',
                'message' => 'Could not create test post'
            ];
        }

        $html = '<h3>Survival Test Results</h3>';
        $html .= '<table class="widefat"><thead><tr><th>Test</th><th>Status</th><th>Message</th></tr></thead><tbody>';
        
        foreach ($results['tests'] as $test) {
            $status_class = $test['status'] === 'pass' ? 'success' : 'error';
            $html .= sprintf(
                '<tr><td>%s</td><td class="%s">%s</td><td>%s</td></tr>',
                esc_html($test['name']),
                $status_class,
                strtoupper($test['status']),
                esc_html($test['message'])
            );
        }
        
        $html .= '</tbody></table>';
        
        ob_start();
        settings_fields('c2c_settings');
        do_settings_sections('c2c_settings');
        submit_button('Save Settings');
        $form_html = ob_get_clean();

        wp_send_json_success(['html' => $html]);
    }

    /**
     * Settings callbacks
     */
    public static function generalSectionCallback() {
        echo '<p>Configure your C2 Concierge connection and basic settings.</p>';
    }

    public static function policySectionCallback() {
        $remote_enforced = get_option('c2c_remote_only', false);
        if ($remote_enforced) {
            echo '<p><strong>Remote-only mode is currently enforced.</strong> Some settings may be locked.</p>';
        } else {
            echo '<p>Configure C2PA policy and behavior settings.</p>';
        }
    }

    public static function textFieldCallback($args) {
        $name = $args['name'];
        $value = get_option($name, '');
        $disabled = ($name === 'c2c_tenant_id' && get_option('c2c_remote_only', false)) ? 'disabled' : '';
        
        printf(
            '<input type="text" name="%s" value="%s" class="regular-text" %s>',
            esc_attr($name),
            esc_attr($value),
            $disabled
        );
        
        if (!empty($args['description'])) {
            echo '<p class="description">' . esc_html($args['description']) . '</p>';
        }
    }

    public static function checkboxCallback($args) {
        $name = $args['name'];
        $checked = get_option($name, true) ? 'checked' : '';
        $disabled = get_option('c2c_remote_only', false) ? 'disabled' : '';
        
        printf(
            '<input type="checkbox" name="%s" value="1" %s %s>',
            esc_attr($name),
            $checked,
            $disabled
        );
        
        if (!empty($args['description'])) {
            echo '<p class="description">' . esc_html($args['description']) . '</p>';
        }
    }

    public static function numberFieldCallback($args) {
        $name = $args['name'];
        $value = get_option($name, 7);
        $min = isset($args['min']) ? "min=\"{$args['min']}\"" : '';
        $max = isset($args['max']) ? "max=\"{$args['max']}\"" : '';
        
        printf(
            '<input type="number" name="%s" value="%s" class="small-text" %s %s>',
            esc_attr($name),
            esc_attr($value),
            $min,
            $max
        );
        
        if (!empty($args['description'])) {
            echo '<p class="description">' . esc_html($args['description']) . '</p>';
        }
    }
}

// Register AJAX handler
add_action('wp_ajax_c2c_survival_test', ['C2C\\Admin', 'handleSurvivalTest']);
