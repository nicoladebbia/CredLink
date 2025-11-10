<?php
/**
 * Plugin Name: C2PA Pilot - Content Credentials
 * Description: 14-day pilot for Content Credentials survival testing
 * Version: 1.0.0
 * Author: CredLink Inc.
 * License: GPL v2 or later
 * Text Domain: c2pa-pilot
 * Requires at least: 5.0
 * Tested up to: 6.4
 * Requires PHP: 7.4
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('C2PA_PILOT_VERSION', '1.0.0');
define('C2PA_PILOT_MIN_WP', '5.0');
define('C2PA_PILOT_MIN_PHP', '7.4');
define('C2PA_PILOT_API_URL', 'https://api.credlink.io');
define('C2PA_PILOT_VERIFY_URL', 'https://verify.credlink.io');

// Plugin activation check
function c2pa_pilot_check_requirements() {
    if (version_compare($GLOBALS['wp_version'], C2PA_PILOT_MIN_WP, '<')) {
        deactivate_plugins(plugin_basename(__FILE__));
        wp_die(sprintf(
            'C2PA Pilot requires WordPress %s or higher. You are running version %s.',
            C2PA_PILOT_MIN_WP,
            $GLOBALS['wp_version']
        ));
    }
    
    if (version_compare(PHP_VERSION, C2PA_PILOT_MIN_PHP, '<')) {
        deactivate_plugins(plugin_basename(__FILE__));
        wp_die(sprintf(
            'C2PA Pilot requires PHP %s or higher. You are running version %s.',
            C2PA_PILOT_MIN_PHP,
            PHP_VERSION
        ));
    }
}
register_activation_hook(__FILE__, 'c2pa_pilot_check_requirements');

class C2PA_Pilot {
    private $tenant_id;
    private $api_key;
    private $manifest_base;
    
    public function __construct() {
        add_action('init', [$this, 'init']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_filter('wp_head', [$this, 'inject_manifest_links']);
        add_action('add_meta_boxes', [$this, 'add_media_meta_box']);
        add_action('wp_ajax_c2pa_sign_media', [$this, 'ajax_sign_media']);
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_notices', [$this, 'admin_notices']);
        
        // Initialize settings
        $this->tenant_id = get_option('c2pa_tenant_id', '');
        $this->api_key = get_option('c2pa_api_key', '');
        $this->manifest_base = get_option('c2pa_manifest_base', '');
    }
    
    public function init() {
        // Load plugin text domain
        load_plugin_textdomain('c2pa-pilot', false, dirname(plugin_basename(__FILE__)) . '/languages');
        
        // Register activation hook
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
    }
    
    public function activate() {
        // Set default options
        add_option('c2pa_pilot_active', true);
        add_option('c2pa_tenant_id', '');
        add_option('c2pa_api_key', '');
        add_option('c2pa_manifest_base', '');
        add_option('c2pa_badge_enabled', true);
        add_option('c2pa_pilot_start_date', current_time('mysql'));
        
        // Create signing queue table
        global $wpdb;
        $table_name = $wpdb->prefix . 'c2pa_signing_queue';
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE $table_name (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            attachment_id bigint(20) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            manifest_url text,
            error_message text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY attachment_id (attachment_id),
            KEY status (status)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }
    
    public function deactivate() {
        // Clean up options if desired
        // delete_option('c2pa_pilot_active');
        flush_rewrite_rules();
    }
    
    public function enqueue_scripts() {
        if (!get_option('c2pa_badge_enabled', true)) {
            return;
        }
        
        // Use CDN fallback for pilot
        $badge_js_url = plugin_dir_url(__FILE__) . 'c2-badge.esm.js';
        $badge_css_url = plugin_dir_url(__FILE__) . 'c2-badge.css';
        
        // Check if files exist in plugin directory
        if (!file_exists(plugin_dir_path(__FILE__) . 'c2-badge.esm.js')) {
            // Use CDN fallback
            $badge_js_url = 'https://cdn.credlink.io/c2-badge/c2-badge.esm.js';
        }
        
        if (!file_exists(plugin_dir_path(__FILE__) . 'c2-badge.css')) {
            // Use CDN fallback
            $badge_css_url = 'https://cdn.credlink.io/c2-badge/c2-badge.css';
        }
        
        wp_enqueue_script(
            'c2pa-badge',
            $badge_js_url,
            [],
            C2PA_PILOT_VERSION,
            true
        );
        
        wp_enqueue_style(
            'c2pa-badge',
            $badge_css_url,
            [],
            C2PA_PILOT_VERSION
        );
        
        // Add inline configuration
        wp_add_inline_script('c2pa-badge', sprintf(
            'window.C2PA_CONFIG = %s;',
            json_encode([
                'manifestBase' => get_option('c2pa_manifest_base', ''),
                'tenantId' => get_option('c2pa_tenant_id', ''),
                'verifyUrl' => C2PA_PILOT_VERIFY_URL,
                'badgePosition' => 'bottom-right',
                'showOnHover' => false
            ])
        ));
    }
    
    public function inject_manifest_links() {
        if (!get_option('c2pa_pilot_active', false) || empty($this->tenant_id)) {
            return;
        }
        
        // Get global manifest link for site
        $global_manifest = $this->get_global_manifest();
        if ($global_manifest) {
            echo '<link rel="c2pa-manifest" href="' . esc_url($global_manifest) . '">' . "\n";
        }
    }
    
    private function get_global_manifest() {
        if (empty($this->manifest_base)) {
            return false;
        }
        
        return trailingslashit($this->manifest_base) . 'site-manifest.jsonld';
    }
    
    public function add_media_meta_box() {
        add_meta_box(
            'c2pa-manifest',
            __('Content Credentials', 'c2pa-pilot'),
            [$this, 'media_meta_box_callback'],
            'attachment',
            'side',
            'default'
        );
    }
    
    public function media_meta_box_callback($post) {
        $manifest_url = get_post_meta($post->ID, '_c2pa_manifest_url', true);
        $status = get_post_meta($post->ID, '_c2pa_status', true);
        $error = get_post_meta($post->ID, '_c2pa_error', true);
        
        echo '<div class="c2pa-media-meta">';
        echo '<p><strong>' . __('Status:', 'c2pa-pilot') . '</strong> ' . esc_html($status ?: 'Not signed') . '</p>';
        
        if ($manifest_url) {
            echo '<p><strong>' . __('Manifest:', 'c2pa-pilot') . '</strong><br>';
            echo '<a href="' . esc_url($manifest_url) . '" target="_blank">' . esc_html($manifest_url) . '</a></p>';
        }
        
        if ($error) {
            echo '<p><strong>' . __('Error:', 'c2pa-pilot') . '</strong><br>';
            echo '<span style="color: red;">' . esc_html($error) . '</span></p>';
        }
        
        if ($status !== 'signed' && current_user_can('upload_files')) {
            echo '<p><button type="button" class="button button-primary c2pa-sign-media" data-attachment-id="' . esc_attr($post->ID) . '">' . __('Sign with C2PA', 'c2pa-pilot') . '</button></p>';
        }
        
        echo '</div>';
        
        // Add JavaScript for AJAX signing
        ?>
        <script>
        jQuery(document).ready(function($) {
            $('.c2pa-sign-media').click(function() {
                var button = $(this);
                var attachmentId = button.data('attachment-id');
                
                button.prop('disabled', true).text('Signing...');
                
                $.post(ajaxurl, {
                    action: 'c2pa_sign_media',
                    attachment_id: attachmentId,
                    _wpnonce: '<?php echo wp_create_nonce("c2pa_sign_media"); ?>'
                }, function(response) {
                    if (response.success) {
                        location.reload();
                    } else {
                        alert('Error: ' + response.data);
                        button.prop('disabled', false).text('Sign with C2PA');
                    }
                }).fail(function() {
                    alert('Network error occurred');
                    button.prop('disabled', false).text('Sign with C2PA');
                });
            });
        });
        </script>
        <?php
    }
    
    public function ajax_sign_media() {
        check_ajax_referer('c2pa_sign_media');
        
        if (!current_user_can('upload_files')) {
            wp_send_json_error(__('Permission denied', 'c2pa-pilot'));
        }
        
        $attachment_id = intval($_POST['attachment_id']);
        $attachment = get_post($attachment_id);
        
        if (!$attachment || $attachment->post_type !== 'attachment') {
            wp_send_json_error(__('Invalid attachment', 'c2pa-pilot'));
        }
        
        // Check rate limiting
        $user_id = get_current_user_id();
        $cache_key = "c2pa_sign_rate_{$user_id}";
        $recent_signs = wp_cache_get($cache_key);
        
        if ($recent_signs === false) {
            $recent_signs = 0;
        }
        
        if ($recent_signs >= 10) { // Max 10 signs per minute
            wp_send_json_error(__('Rate limit exceeded. Please try again in a minute.', 'c2pa-pilot'));
        }
        
        // Increment rate limit counter
        wp_cache_set($cache_key, $recent_signs + 1, '', 60);
        
        // Queue for signing
        $this->queue_for_signing($attachment_id);
        
        // Process signing with proper error handling
        try {
            $result = $this->sign_attachment($attachment_id);
            
            if ($result['success']) {
                update_post_meta($attachment_id, '_c2pa_status', 'signed');
                update_post_meta($attachment_id, '_c2pa_manifest_url', $result['manifest_url']);
                update_post_meta($attachment_id, '_c2pa_signed_at', current_time('mysql'));
                
                // Log successful signing
                error_log("C2PA: Successfully signed attachment {$attachment_id} for tenant {$this->tenant_id}");
                
                wp_send_json_success(__('Attachment signed successfully', 'c2pa-pilot'));
            } else {
                update_post_meta($attachment_id, '_c2pa_status', 'error');
                update_post_meta($attachment_id, '_c2pa_error', $result['error']);
                
                // Log signing error
                error_log("C2PA: Failed to sign attachment {$attachment_id}: {$result['error']}");
                
                wp_send_json_error($result['error']);
            }
        } catch (Exception $e) {
            update_post_meta($attachment_id, '_c2pa_status', 'error');
            update_post_meta($attachment_id, '_c2pa_error', $e->getMessage());
            
            // Log exception
            error_log("C2PA: Exception signing attachment {$attachment_id}: {$e->getMessage()}");
            
            wp_send_json_error(__('An unexpected error occurred. Please try again.', 'c2pa-pilot'));
        }
    }
    
    private function queue_for_signing($attachment_id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'c2pa_signing_queue';
        $wpdb->insert(
            $table_name,
            [
                'attachment_id' => $attachment_id,
                'status' => 'pending',
                'created_at' => current_time('mysql')
            ]
        );
    }
    
    private function sign_attachment($attachment_id) {
        if (empty($this->api_key) || empty($this->tenant_id)) {
            return ['success' => false, 'error' => 'API credentials not configured'];
        }
        
        $attachment = get_post($attachment_id);
        $file_path = get_attached_file($attachment_id);
        
        if (!file_exists($file_path)) {
            return ['success' => false, 'error' => 'File not found'];
        }
        
        // Call actual signing service
        $response = wp_remote_post(C2PA_PILOT_API_URL . '/sign', [
            'method' => 'POST',
            'headers' => [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $this->api_key,
                'X-Tenant-ID' => $this->tenant_id
            ],
            'body' => json_encode([
                'asset_id' => $attachment_id,
                'asset_url' => wp_get_attachment_url($attachment_id),
                'asset_path' => $file_path,
                'asset_type' => $attachment->post_mime_type,
                'asset_title' => get_the_title($attachment),
                'tenant_id' => $this->tenant_id
            ]),
            'timeout' => 30
        ]);
        
        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        if ($status_code !== 200) {
            return ['success' => false, 'error' => 'Signing service error: ' . $body];
        }
        
        $data = json_decode($body, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            return ['success' => false, 'error' => 'Invalid response from signing service'];
        }
        
        return [
            'success' => true,
            'manifest_url' => $data['manifest_url'] ?? $this->generate_manifest_url($attachment_id)
        ];
    }
    
    private function generate_manifest_url($attachment_id) {
        return trailingslashit($this->manifest_base) . 'manifests/' . $attachment_id . '.jsonld';
    }
    
    public function add_admin_menu() {
        add_options_page(
            __('C2PA Pilot Settings', 'c2pa-pilot'),
            __('C2PA Pilot', 'c2pa-pilot'),
            'manage_options',
            'c2pa-pilot',
            [$this, 'admin_page']
        );
    }
    
    public function admin_page() {
        if (isset($_POST['submit'])) {
            check_admin_referer('c2pa_pilot_settings');
            
            // Validate and sanitize inputs
            $tenant_id = sanitize_text_field($_POST['tenant_id'] ?? '');
            $api_key = sanitize_text_field($_POST['api_key'] ?? '');
            $manifest_base = esc_url_raw($_POST['manifest_base'] ?? '');
            $badge_enabled = isset($_POST['badge_enabled']);
            
            // Validate tenant ID format
            if (!empty($tenant_id) && !preg_match('/^[a-zA-Z0-9_-]+$/', $tenant_id)) {
                echo '<div class="notice notice-error"><p>' . __('Invalid tenant ID format. Use only letters, numbers, hyphens, and underscores.', 'c2pa-pilot') . '</p></div>';
                $tenant_id = get_option('c2pa_tenant_id', '');
            } else {
                update_option('c2pa_tenant_id', $tenant_id);
            }
            
            // Validate API key format
            if (!empty($api_key) && !preg_match('/^[a-zA-Z0-9._-]+$/', $api_key)) {
                echo '<div class="notice notice-error"><p>' . __('Invalid API key format.', 'c2pa-pilot') . '</p></div>';
                $api_key = get_option('c2pa_api_key', '');
            } else {
                update_option('c2pa_api_key', $api_key);
            }
            
            // Validate manifest base URL
            if (!empty($manifest_base)) {
                $parsed = parse_url($manifest_base);
                if (!in_array($parsed['scheme'] ?? '', ['http', 'https']) || !isset($parsed['host'])) {
                    echo '<div class="notice notice-error"><p>' . __('Invalid manifest base URL. Must include http:// or https://', 'c2pa-pilot') . '</p></div>';
                    $manifest_base = get_option('c2pa_manifest_base', '');
                } else {
                    update_option('c2pa_manifest_base', rtrim($manifest_base, '/'));
                }
            } else {
                update_option('c2pa_manifest_base', $manifest_base);
            }
            
            update_option('c2pa_badge_enabled', $badge_enabled);
            
            // Test API connection if credentials provided
            if (!empty($tenant_id) && !empty($api_key)) {
                $test_result = $this->test_api_connection($tenant_id, $api_key);
                if ($test_result['success']) {
                    echo '<div class="notice notice-success"><p>' . __('Settings saved and API connection verified.', 'c2pa-pilot') . '</p></div>';
                } else {
                    echo '<div class="notice notice-warning"><p>' . __('Settings saved but API connection failed: ' . esc_html($test_result['error']), 'c2pa-pilot') . '</p></div>';
                }
            } else {
                echo '<div class="notice notice-success"><p>' . __('Settings saved.', 'c2pa-pilot') . '</p></div>';
            }
        }
        
        $tenant_id = get_option('c2pa_tenant_id', '');
        $api_key = get_option('c2pa_api_key', '');
        $manifest_base = get_option('c2pa_manifest_base', '');
        $badge_enabled = get_option('c2pa_badge_enabled', true);
        $pilot_start = get_option('c2pa_pilot_start_date', current_time('mysql'));
        
        ?>
        <div class="wrap">
            <h1><?php _e('C2PA Pilot Settings', 'c2pa-pilot'); ?></h1>
            
            <div class="notice notice-info">
                <p><strong><?php _e('Pilot Status:', 'c2pa-pilot'); ?></strong> 
                <?php 
                $days_active = floor((time() - strtotime($pilot_start)) / (60 * 60 * 24));
                if ($days_active >= 14) {
                    _e('Pilot completed', 'c2pa-pilot');
                } else {
                    printf(__('Day %d of 14', 'c2pa-pilot'), $days_active + 1);
                }
                ?>
                </p>
            </div>
            
            <form method="post" action="">
                <?php wp_nonce_field('c2pa_pilot_settings'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php _e('Tenant ID', 'c2pa-pilot'); ?></th>
                        <td>
                            <input type="text" name="tenant_id" value="<?php echo esc_attr($tenant_id); ?>" class="regular-text" pattern="[a-zA-Z0-9_-]+" title="<?php _e('Letters, numbers, hyphens, and underscores only', 'c2pa-pilot'); ?>">
                            <p class="description"><?php _e('Your unique tenant identifier provided by CredLink', 'c2pa-pilot'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('API Key', 'c2pa-pilot'); ?></th>
                        <td>
                            <input type="password" name="api_key" value="<?php echo esc_attr($api_key); ?>" class="regular-text" pattern="[a-zA-Z0-9._-]+" title="<?php _e('Valid API key format required', 'c2pa-pilot'); ?>">
                            <p class="description"><?php _e('API key for signing service', 'c2pa-pilot'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Manifest Base URL', 'c2pa-pilot'); ?></th>
                        <td>
                            <input type="url" name="manifest_base" value="<?php echo esc_attr($manifest_base); ?>" class="regular-text" required pattern="https?://.*" title="<?php _e('Must include http:// or https://', 'c2pa-pilot'); ?>">
                            <p class="description"><?php _e('Base URL where manifests are hosted', 'c2pa-pilot'); ?></p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row"><?php _e('Enable Badge', 'c2pa-pilot'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="badge_enabled" <?php checked($badge_enabled); ?>>
                                <?php _e('Show Content Credentials badge on images', 'c2pa-pilot'); ?>
                            </label>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
            
            <h2><?php _e('Quick Actions', 'c2pa-pilot'); ?></h2>
            <p>
                <a href="<?php echo admin_url('upload.php?c2pa_status=unsigned'); ?>" class="button">
                    <?php _e('View Unsigned Media', 'c2pa-pilot'); ?>
                </a>
                <a href="<?php echo admin_url('upload.php?c2pa_status=signed'); ?>" class="button">
                    <?php _e('View Signed Media', 'c2pa-pilot'); ?>
                </a>
                <?php if (!empty($tenant_id) && !empty($api_key)): ?>
                <a href="<?php echo admin_url('admin.php?page=c2pa-pilot&action=test-connection'); ?>" class="button">
                    <?php _e('Test API Connection', 'c2pa-pilot'); ?>
                </a>
                <?php endif; ?>
            </p>
        </div>
        <?php
    }
    
    private function test_api_connection($tenant_id, $api_key) {
        $response = wp_remote_get(C2PA_PILOT_API_URL . '/health', [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'X-Tenant-ID' => $tenant_id
            ],
            'timeout' => 10
        ]);
        
        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        
        if ($status_code === 200) {
            return ['success' => true];
        } else {
            return ['success' => false, 'error' => 'HTTP ' . $status_code];
        }
    }
    
    public function admin_notices() {
        if (!get_option('c2pa_tenant_id') || !get_option('c2pa_api_key')) {
            ?>
            <div class="notice notice-warning">
                <p>
                    <?php _e('C2PA Pilot: Please configure your tenant ID and API key in', 'c2pa-pilot'); ?>
                    <a href="<?php echo admin_url('options-general.php?page=c2pa-pilot'); ?>"><?php _e('Settings', 'c2pa-pilot'); ?></a>
                </p>
            </div>
            <?php
        }
        
        // Show pilot progress
        $pilot_start = get_option('c2pa_pilot_start_date', current_time('mysql'));
        $days_active = floor((time() - strtotime($pilot_start)) / (60 * 60 * 24));
        
        if ($days_active < 14) {
            ?>
            <div class="notice notice-info">
                <p>
                    <?php printf(__('C2PA Pilot Progress: Day %d of 14', 'c2pa-pilot'), $days_active + 1); ?>
                </p>
            </div>
            <?php
        }
    }
}

// Initialize the plugin
function c2pa_pilot_init() {
    return new C2PA_Pilot();
}

// Hook into WordPress
add_action('plugins_loaded', 'c2pa_pilot_init');

// Add filter for media columns
add_filter('manage_media_columns', function($columns) {
    $columns['c2pa_status'] = __('C2PA Status', 'c2pa-pilot');
    return $columns;
});

add_action('manage_media_custom_column', function($column_name, $post_id) {
    if ($column_name === 'c2pa_status') {
        $status = get_post_meta($post_id, '_c2pa_status', true);
        $manifest_url = get_post_meta($post_id, '_c2pa_manifest_url', true);
        
        if ($status === 'signed') {
            echo '<span style="color: green;">✓ ' . __('Signed', 'c2pa-pilot') . '</span>';
            if ($manifest_url) {
                echo '<br><a href="' . esc_url($manifest_url) . '" target="_blank">' . __('View Manifest', 'c2pa-pilot') . '</a>';
            }
        } elseif ($status === 'error') {
            echo '<span style="color: red;">✗ ' . __('Error', 'c2pa-pilot') . '</span>';
        } else {
            echo '<span style="color: orange;">○ ' . __('Unsigned', 'c2pa-pilot') . '</span>';
        }
    }
}, 10, 2);

// Plugin uninstall cleanup
register_uninstall_hook(__FILE__, 'c2pa_pilot_uninstall');
function c2pa_pilot_uninstall() {
    global $wpdb;
    
    // Remove signing queue table
    $table_name = $wpdb->prefix . 'c2pa_signing_queue';
    $wpdb->query("DROP TABLE IF EXISTS $table_name");
    
    // Remove options
    delete_option('c2pa_pilot_active');
    delete_option('c2pa_tenant_id');
    delete_option('c2pa_api_key');
    delete_option('c2pa_manifest_base');
    delete_option('c2pa_badge_enabled');
    delete_option('c2pa_pilot_start_date');
    
    // Remove post meta
    delete_post_meta_by_key('_c2pa_status');
    delete_post_meta_by_key('_c2pa_manifest_url');
    delete_post_meta_by_key('_c2pa_error');
    delete_post_meta_by_key('_c2pa_signed_at');
}
