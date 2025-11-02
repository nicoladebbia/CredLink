<?php

namespace C2C;

use Exception;
use WP_Error;

class RetroSign {
    private static $initialized = false;
    private static $max_batch_size = 50;
    private static $rate_limit_delay = 1; // seconds
    private static $max_execution_time = 300; // 5 minutes
    private static $memory_limit = '256M';
    private static $allowed_intervals = [
        'hourly' => 3600,
        'daily' => 86400,
        'weekly' => 604800,
        'monthly' => 2592000
    ];

    /**
     * Initialize retro-sign with comprehensive security
     */
    public static function init() {
        if (self::$initialized) {
            return;
        }
        
        try {
            // SECURITY: Validate WordPress context
            if (!self::validateWordPressContext()) {
                throw new Exception('Invalid WordPress context for retro-sign');
            }

            // SECURITY: Validate hook registration
            if (self::validateHookRegistration()) {
                add_filter('cron_schedules', [__CLASS__, 'addCustomSchedule'], 10, 1);
                add_action('c2c_retro_sign_daily', [__CLASS__, 'executeDailyRetroSign'], 10, 0);
                add_action('c2c_emergency_retro_sign', [__CLASS__, 'executeEmergencyRetroSign'], 10, 0);
            }
            
            self::$initialized = true;
            error_log('C2C: RetroSign initialized successfully');
            
        } catch (Exception $e) {
            error_log('C2C: RetroSign initialization failed: ' . $e->getMessage());
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
            'add_action',
            'wp_next_scheduled',
            'wp_schedule_event',
            'wp_clear_scheduled_hook',
            'get_option',
            'update_option',
            'get_post_meta',
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
        if (!function_exists('add_filter') || !function_exists('add_action')) {
            return false;
        }
        
        // Check class methods exist
        $required_methods = [
            'addCustomSchedule',
            'activate',
            'deactivate',
            'executeDailyRetroSign',
            'executeEmergencyRetroSign',
            'triggerEmergencyRetroSign',
            'processRetroSignBatch',
            'validateExecutionEnvironment'
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
     * SECURITY: Plugin activation with comprehensive validation
     */
    public static function activate() {
        try {
            // SECURITY: Validate execution environment
            if (!self::validateExecutionEnvironment()) {
                throw new Exception('Invalid execution environment for activation');
            }

            // SECURITY: Check if cron is already scheduled
            if (!wp_next_scheduled('c2c_retro_sign_daily')) {
                // SECURITY: Validate timestamp
                $timestamp = self::validateTimestamp(time());
                if ($timestamp === false) {
                    throw new Exception('Invalid timestamp for cron scheduling');
                }

                // SECURITY: Schedule with validation
                $scheduled = wp_schedule_event($timestamp, 'daily', 'c2c_retro_sign_daily');
                if ($scheduled === false) {
                    throw new Exception('Failed to schedule daily retro-sign cron');
                }
            }

            // SECURITY: Run initial optimizer check with validation
            if (class_exists('C2C\OptimizerDetector') && method_exists('C2C\OptimizerDetector', 'runComprehensiveCheck')) {
                OptimizerDetector::runComprehensiveCheck();
            } else {
                error_log('C2C: OptimizerDetector not available for initial check');
            }

            error_log('C2C: RetroSign activation completed successfully');

        } catch (Exception $e) {
            error_log('C2C: RetroSign activation failed: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * SECURITY: Plugin deactivation with validation
     */
    public static function deactivate() {
        try {
            // SECURITY: Clear scheduled hooks with validation
            $hooks_to_clear = [
                'c2c_retro_sign_daily',
                'c2c_emergency_retro_sign'
            ];

            foreach ($hooks_to_clear as $hook) {
                $cleared = wp_clear_scheduled_hook($hook);
                if ($cleared === false) {
                    error_log("C2C: Failed to clear scheduled hook: {$hook}");
                }
            }

            error_log('C2C: RetroSign deactivation completed successfully');

        } catch (Exception $e) {
            error_log('C2C: RetroSign deactivation failed: ' . $e->getMessage());
        }
    }

    /**
     * SECURITY: Add custom cron schedule with validation
     */
    public static function addCustomSchedule($schedules) {
        try {
            // SECURITY: Validate input parameter
            if (!is_array($schedules)) {
                return [];
            }

            // SECURITY: Validate schedule data
            $custom_schedule = [
                'interval' => 3600, // 1 hour
                'display' => 'C2C Hourly'
            ];

            // SECURITY: Validate interval
            if ($custom_schedule['interval'] <= 0 || $custom_schedule['interval'] > 86400) {
                error_log('C2C: Invalid cron interval');
                return $schedules;
            }

            // SECURITY: Validate display name
            if (!$custom_schedule['display'] || !is_string($custom_schedule['display'])) {
                error_log('C2C: Invalid cron display name');
                return $schedules;
            }

            $schedules['c2c_hourly'] = $custom_schedule;
            return $schedules;

        } catch (Exception $e) {
            error_log('C2C: Error adding custom schedule: ' . $e->getMessage());
            return $schedules ?: [];
        }
    }

    /**
     * SECURITY: Execute daily retro-sign job with comprehensive validation
     */
    public static function executeDailyRetroSign() {
        try {
            // SECURITY: Validate execution environment
            if (!self::validateExecutionEnvironment()) {
                throw new Exception('Invalid execution environment for daily retro-sign');
            }

            // SECURITY: Validate and get configuration
            $days_back = self::validateDaysBack();
            if ($days_back === false) {
                throw new Exception('Invalid days back configuration');
            }

            // SECURITY: Get attachments with validation
            $attachments = self::getAttachmentsForRetroSign($days_back);
            if (!is_array($attachments)) {
                throw new Exception('Failed to get attachments for retro-sign');
            }

            // SECURITY: Process batch with limits
            $results = self::processRetroSignBatch($attachments);

            // SECURITY: Log results with sanitization
            self::logRetroSignResults($results, 'daily');

            // SECURITY: Store results with validation
            self::storeRetroSignResults($results, 'daily');

            return $results;

        } catch (Exception $e) {
            error_log('C2C: Error in executeDailyRetroSign: ' . $e->getMessage());
            return ['processed' => 0, 'failed' => 0, 'skipped' => 0, 'error' => $e->getMessage()];
        }
    }

    /**
     * SECURITY: Execute emergency retro-sign job
     */
    public static function executeEmergencyRetroSign() {
        try {
            // SECURITY: Validate execution environment
            if (!self::validateExecutionEnvironment()) {
                throw new Exception('Invalid execution environment for emergency retro-sign');
            }

            // SECURITY: Get all unsigned attachments (last 24 hours)
            $attachments = self::getAttachmentsForEmergencyRetroSign();
            if (!is_array($attachments)) {
                throw new Exception('Failed to get attachments for emergency retro-sign');
            }

            // SECURITY: Process batch with higher priority
            $results = self::processRetroSignBatch($attachments, true);

            // SECURITY: Log results with sanitization
            self::logRetroSignResults($results, 'emergency');

            // SECURITY: Store results with validation
            self::storeRetroSignResults($results, 'emergency');

            return $results;

        } catch (Exception $e) {
            error_log('C2C: Error in executeEmergencyRetroSign: ' . $e->getMessage());
            return ['processed' => 0, 'failed' => 0, 'skipped' => 0, 'error' => $e->getMessage()];
        }
    }

    /**
     * SECURITY: Trigger emergency retro-sign
     */
    public static function triggerEmergencyRetroSign() {
        try {
            // SECURITY: Validate execution environment
            if (!self::validateExecutionEnvironment()) {
                throw new Exception('Invalid execution environment for emergency trigger');
            }

            // SECURITY: Schedule emergency retro-sign
            if (!wp_next_scheduled('c2c_emergency_retro_sign')) {
                $timestamp = self::validateTimestamp(time());
                if ($timestamp === false) {
                    throw new Exception('Invalid timestamp for emergency retro-sign');
                }

                $scheduled = wp_schedule_event($timestamp, 'c2c_hourly', 'c2c_emergency_retro_sign');
                if ($scheduled === false) {
                    throw new Exception('Failed to schedule emergency retro-sign');
                }
            }

            error_log('C2C: Emergency retro-sign triggered successfully');

        } catch (Exception $e) {
            error_log('C2C: Error triggering emergency retro-sign: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * SECURITY: Validate execution environment
     */
    private static function validateExecutionEnvironment() {
        // SECURITY: Check memory limit
        $current_memory = ini_get('memory_limit');
        if ($current_memory !== '-1' && self::convertToBytes($current_memory) < self::convertToBytes(self::$memory_limit)) {
            error_log('C2C: Memory limit too low for retro-sign operations');
            return false;
        }

        // SECURITY: Check execution time
        $max_execution_time = ini_get('max_execution_time');
        if ($max_execution_time !== '0' && (int)$max_execution_time < self::$max_execution_time) {
            error_log('C2C: Execution time limit too low for retro-sign operations');
            return false;
        }

        // SECURITY: Check required classes
        if (!class_exists('C2C\Injector')) {
            error_log('C2C: Injector class not available for retro-sign');
            return false;
        }

        return true;
    }

    /**
     * SECURITY: Convert memory limit to bytes
     */
    private static function convertToBytes($value) {
        $unit = strtolower(substr($value, -1));
        $value = (int)$value;
        
        switch ($unit) {
            case 'g':
                return $value * 1024 * 1024 * 1024;
            case 'm':
                return $value * 1024 * 1024;
            case 'k':
                return $value * 1024;
            default:
                return $value;
        }
    }

    /**
     * SECURITY: Validate timestamp
     */
    private static function validateTimestamp($timestamp) {
        if (!is_numeric($timestamp)) {
            return false;
        }
        
        $timestamp = (int)$timestamp;
        
        if ($timestamp <= 0) {
            return false;
        }
        
        if ($timestamp > PHP_INT_MAX) {
            return false;
        }
        
        return $timestamp;
    }

    /**
     * SECURITY: Validate days back configuration
     */
    private static function validateDaysBack() {
        $days_back = get_option('c2c_retro_sign_days', 7);
        
        if (!is_numeric($days_back)) {
            return 7; // Default
        }
        
        $days_back = (int)$days_back;
        
        if ($days_back < 1) {
            return 1; // Minimum
        }
        
        if ($days_back > 365) {
            return 365; // Maximum
        }
        
        return $days_back;
    }

    /**
     * SECURITY: Get attachments for retro-sign with validation
     */
    private static function getAttachmentsForRetroSign($days_back) {
        try {
            // SECURITY: Validate Injector class and method
            if (!class_exists('C2C\Injector') || !method_exists('C2C\Injector', 'getAttachmentsForRetroSign')) {
                throw new Exception('Injector method not available');
            }

            // SECURITY: Call with error handling
            $attachments = Injector::getAttachmentsForRetroSign($days_back);
            
            if (!is_array($attachments)) {
                throw new Exception('Invalid attachments response');
            }
            
            // SECURITY: Limit batch size
            if (count($attachments) > self::$max_batch_size) {
                $attachments = array_slice($attachments, 0, self::$max_batch_size);
                error_log('C2C: Retro-sign batch limited to ' . self::$max_batch_size . ' attachments');
            }
            
            return $attachments;

        } catch (Exception $e) {
            error_log('C2C: Error getting attachments for retro-sign: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * SECURITY: Get attachments for emergency retro-sign
     */
    private static function getAttachmentsForEmergencyRetroSign() {
        try {
            // SECURITY: Get attachments from last 24 hours
            $attachments = Injector::getAttachmentsForRetroSign(1);
            
            if (!is_array($attachments)) {
                throw new Exception('Invalid emergency attachments response');
            }
            
            return $attachments;

        } catch (Exception $e) {
            error_log('C2C: Error getting emergency attachments: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * SECURITY: Process retro-sign batch with comprehensive validation
     */
    private static function processRetroSignBatch($attachments, $emergency = false) {
        $processed = 0;
        $failed = 0;
        $skipped = 0;
        $errors = [];

        try {
            // SECURITY: Validate attachments array
            if (!is_array($attachments) || empty($attachments)) {
                return ['processed' => 0, 'failed' => 0, 'skipped' => 0, 'errors' => ['No attachments to process']];
            }

            // SECURITY: Validate Injector method
            if (!class_exists('C2C\Injector') || !method_exists('C2C\Injector', 'processRetroSign')) {
                throw new Exception('Injector processRetroSign method not available');
            }

            foreach ($attachments as $attachment) {
                try {
                    // SECURITY: Validate attachment object
                    if (!is_object($attachment) || !isset($attachment->ID)) {
                        $failed++;
                        $errors[] = 'Invalid attachment object';
                        continue;
                    }

                    // SECURITY: Validate attachment ID
                    $attachment_id = self::validateAttachmentId($attachment->ID);
                    if ($attachment_id === false) {
                        $failed++;
                        $errors[] = 'Invalid attachment ID: ' . $attachment->ID;
                        continue;
                    }

                    // SECURITY: Check if processing is needed
                    if (self::shouldSkipAttachment($attachment_id, $emergency)) {
                        $skipped++;
                        continue;
                    }

                    // SECURITY: Process retro-sign with error handling
                    $success = Injector::processRetroSign($attachment_id);
                    
                    if ($success) {
                        $processed++;
                    } else {
                        $failed++;
                        $errors[] = 'Failed to process attachment: ' . $attachment_id;
                    }

                    // SECURITY: Rate limiting
                    if ($processed % 10 === 0) {
                        sleep(self::$rate_limit_delay);
                    }

                    // SECURITY: Check execution time
                    if (self::isExecutionTimeExceeded()) {
                        error_log('C2C: Retro-sign execution time exceeded, stopping batch');
                        break;
                    }

                } catch (Exception $e) {
                    $failed++;
                    $errors[] = 'Exception processing attachment: ' . $e->getMessage();
                    error_log('C2C: Error processing attachment: ' . $e->getMessage());
                }
            }

            return [
                'processed' => $processed,
                'failed' => $failed,
                'skipped' => $skipped,
                'errors' => array_slice($errors, 0, 10) // Limit error storage
            ];

        } catch (Exception $e) {
            error_log('C2C: Error in processRetroSignBatch: ' . $e->getMessage());
            return ['processed' => $processed, 'failed' => $failed, 'skipped' => $skipped, 'errors' => [$e->getMessage()]];
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
        
        return $attachment_id;
    }

    /**
     * SECURITY: Check if attachment should be skipped
     */
    private static function shouldSkipAttachment($attachment_id, $emergency) {
        try {
            // SECURITY: Get manifest URL with validation
            $manifest_url = get_post_meta($attachment_id, '_c2_manifest_url', true);
            
            if (empty($manifest_url)) {
                return false; // Need to sign
            }

            // SECURITY: In emergency mode, always process
            if ($emergency) {
                return false;
            }

            // SECURITY: Check if manifest is outdated (older than 30 days)
            $signed_at = get_post_meta($attachment_id, '_c2_signed_at', true);
            
            if (!$signed_at) {
                return false; // No sign date, need to sign
            }

            // SECURITY: Validate and compare dates
            $signed_timestamp = strtotime($signed_at);
            $cutoff_timestamp = strtotime('-30 days');
            
            if ($signed_timestamp === false || $cutoff_timestamp === false) {
                return false; // Invalid dates, process
            }

            return $signed_timestamp >= $cutoff_timestamp;

        } catch (Exception $e) {
            error_log('C2C: Error checking if attachment should be skipped: ' . $e->getMessage());
            return false; // Process on error
        }
    }

    /**
     * SECURITY: Check if execution time is exceeded
     */
    private static function isExecutionTimeExceeded() {
        $current_time = time();
        $start_time = $_SERVER['REQUEST_TIME'] ?? time();
        $elapsed = $current_time - $start_time;
        
        return $elapsed >= (self::$max_execution_time - 30); // 30 second buffer
    }

    /**
     * SECURITY: Log retro-sign results with sanitization
     */
    private static function logRetroSignResults($results, $type) {
        try {
            // SECURITY: Validate results array
            if (!is_array($results)) {
                error_log('C2C: Invalid results array for logging');
                return;
            }

            $processed = (int)($results['processed'] ?? 0);
            $failed = (int)($results['failed'] ?? 0);
            $skipped = (int)($results['skipped'] ?? 0);

            // SECURITY: Sanitize log message
            $log_message = sprintf(
                'C2C Retro-sign (%s) completed: %d processed, %d failed, %d skipped',
                sanitize_text_field($type),
                $processed,
                $failed,
                $skipped
            );

            error_log($log_message);

            // SECURITY: Log errors if any
            if (!empty($results['errors']) && is_array($results['errors'])) {
                foreach (array_slice($results['errors'], 0, 5) as $error) {
                    error_log('C2C Retro-sign error: ' . sanitize_text_field($error));
                }
            }

        } catch (Exception $e) {
            error_log('C2C: Error logging retro-sign results: ' . $e->getMessage());
        }
    }

    /**
     * SECURITY: Store retro-sign results with validation
     */
    private static function storeRetroSignResults($results, $type) {
        try {
            // SECURITY: Validate results array
            if (!is_array($results)) {
                error_log('C2C: Invalid results array for storage');
                return;
            }

            // SECURITY: Prepare results for storage
            $storage_data = [
                'timestamp' => current_time('mysql'),
                'type' => sanitize_text_field($type),
                'processed' => (int)($results['processed'] ?? 0),
                'failed' => (int)($results['failed'] ?? 0),
                'skipped' => (int)($results['skipped'] ?? 0),
                'errors' => array_slice((array)($results['errors'] ?? []), 0, 5)
            ];

            // SECURITY: Store with validation
            $option_key = $type === 'emergency' ? 'c2c_last_emergency_retro_sign' : 'c2c_last_retro_sign';
            $updated = update_option($option_key, $storage_data, false);

            if (!$updated) {
                error_log('C2C: Failed to store retro-sign results');
            }

        } catch (Exception $e) {
            error_log('C2C: Error storing retro-sign results: ' . $e->getMessage());
        }
    }
            'processed' => $processed,
            'failed' => $failed,
            'skipped' => $skipped,
            'total' => count($attachments)
        ]);
    }

    /**
     * Emergency retro-sign for recent attachments
     */
    public static function emergencyRetroSign($limit = 50) {
        global $wpdb;
        
        $attachments = $wpdb->get_results($wpdb->prepare("
            SELECT ID 
            FROM {$wpdb->posts} 
            WHERE post_type = 'attachment' 
            AND post_mime_name LIKE 'image/%'
            ORDER BY post_date DESC 
            LIMIT %d
        ", $limit));

        $processed = 0;
        $failed = 0;

        foreach ($attachments as $attachment) {
            $success = Injector::processRetroSign($attachment->ID);
            if ($success) {
                $processed++;
            } else {
                $failed++;
            }

            // Aggressive rate limiting for emergency
            usleep(250000); // 0.25 second delay
        }

        error_log("C2C Emergency retro-sign: {$processed} processed, {$failed} failed");
        
        return [
            'processed' => $processed,
            'failed' => $failed,
            'total' => count($attachments)
        ];
    }

    /**
     * Manual retro-sign trigger
     */
    public static function manualRetroSign($days_back = 7) {
        $attachments = Injector::getAttachmentsForRetroSign($days_back);
        
        $results = [
            'total' => count($attachments),
            'processed' => 0,
            'failed' => 0,
            'skipped' => 0
        ];

        foreach ($attachments as $attachment) {
            if (empty($attachment->manifest_url)) {
                $success = Injector::processRetroSign($attachment->ID);
                if ($success) {
                    $results['processed']++;
                } else {
                    $results['failed']++;
                }
            } else {
                $results['skipped']++;
            }

            // Rate limiting
            usleep(500000); // 0.5 second delay
        }

        return $results;
    }

    /**
     * Get retro-sign statistics
     */
    public static function getRetroSignStats() {
        $last_run = get_option('c2c_last_retro_sign', []);
        
        if (empty($last_run)) {
            return [
                'last_run' => 'Never',
                'processed' => 0,
                'failed' => 0,
                'skipped' => 0,
                'total' => 0
            ];
        }

        return [
            'last_run' => $last_run['timestamp'] ?? 'Unknown',
            'processed' => $last_run['processed'] ?? 0,
            'failed' => $last_run['failed'] ?? 0,
            'skipped' => $last_run['skipped'] ?? 0,
            'total' => $last_run['total'] ?? 0
        ];
    }

    /**
     * Check if retro-sign is needed
     */
    public static function isRetroSignNeeded() {
        $days_back = get_option('c2c_retro_sign_days', 7);
        $attachments = Injector::getAttachmentsForRetroSign($days_back);
        
        $unsigned_count = 0;
        foreach ($attachments as $attachment) {
            if (empty($attachment->manifest_url)) {
                $unsigned_count++;
            }
        }

        return $unsigned_count > 0;
    }

    /**
     * Get attachments needing signing
     */
    public static function getUnsignedAttachments($limit = 20) {
        global $wpdb;
        
        $days_back = get_option('c2c_retro_sign_days', 7);
        $cutoff_date = date('Y-m-d H:i:s', strtotime("-{$days_back} days"));
        
        $attachments = $wpdb->get_results($wpdb->prepare("
            SELECT p.ID, p.post_title, p.post_date, p.guid
            FROM {$wpdb->posts} p
            LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_c2_manifest_url'
            WHERE p.post_type = 'attachment'
            AND p.post_date > %s
            AND p.post_mime_name LIKE 'image/%'
            AND pm.meta_value IS NULL
            ORDER BY p.post_date DESC
            LIMIT %d
        ", $cutoff_date, $limit));

        return $attachments;
    }
}

// Hook the daily retro-sign job
add_action('c2c_retro_sign_daily', ['C2C\\RetroSign', 'executeDailyRetroSign']);
