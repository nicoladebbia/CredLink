<?php

namespace Drupal\c2c_c2pa\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Configure C2 Concierge C2PA settings.
 */
class SettingsForm extends ConfigFormBase {

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'c2c_c2pa_settings';
  }

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames(): array {
    return ['c2c_c2pa.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('c2c_c2pa.settings');

    $form['sign_service'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Signing Service Configuration'),
      '#description' => $this->t('Configure the C2PA signing service endpoint.'),
    ];

    $form['sign_service']['sign_url'] = [
      '#type' => 'url',
      '#title' => $this->t('Sign API URL'),
      '#default_value' => $config->get('sign_url') ?: 'https://verify.c2concierge.org/sign',
      '#required' => TRUE,
      '#description' => $this->t('The endpoint URL for signing media assets with C2PA manifests.'),
      '#element_validate' => [[static::class, 'validateHttpsUrl']],
    ];

    $form['sign_service']['manifest_host'] = [
      '#type' => 'url',
      '#title' => $this->t('Manifest Host'),
      '#default_value' => $config->get('manifest_host') ?: 'https://manifests.c2concierge.org',
      '#required' => TRUE,
      '#description' => $this->t('Base URL where signed manifests are stored.'),
      '#element_validate' => [[static::class, 'validateHttpsUrl']],
    ];

    $form['sign_service']['api_key'] = [
      '#type' => 'password',
      '#title' => $this->t('API Key'),
      '#default_value' => '', // CRITICAL: Never populate password field with existing value
      '#description' => $this->t('API key for the signing service. Leave blank to keep current value. Must be at least 32 characters with uppercase, lowercase, numbers, and symbols.'),
      '#required' => FALSE,
      '#element_validate' => [[static::class, 'validateApiKey']],
    ];

    $form['processing'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Asset Processing'),
      '#description' => $this->t('Configure how media assets are processed.'),
    ];

    $form['processing']['remote_only'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Remote-only mode'),
      '#default_value' => $config->get('remote_only') !== false,
      '#description' => $this->t('Store manifests remotely only. This is the recommended default for security and performance.'),
    ];

    $form['processing']['auto_sign_uploads'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Automatically sign uploads'),
      '#default_value' => $config->get('auto_sign_uploads') !== false,
      '#description' => $this->t('Automatically sign media files when they are uploaded.'),
    ];

    $form['processing']['max_file_size'] = [
      '#type' => 'number',
      '#title' => $this->t('Maximum File Size (MB)'),
      '#default_value' => $config->get('max_file_size') ?: 50,
      '#required' => TRUE,
      '#min' => 1,
      '#max' => 500,
      '#description' => $this->t('Maximum file size in MB for automatic signing.'),
      '#element_validate' => [[static::class, 'validateNumberRange']],
    ];

    $form['processing']['supported_media_types'] = [
      '#type' => 'checkboxes',
      '#title' => $this->t('Supported Media Types'),
      '#default_value' => $config->get('supported_media_types') ?: ['image'],
      '#options' => [
        'image' => $this->t('Images'),
        'video' => $this->t('Videos'),
        'audio' => $this->t('Audio'),
        'file' => $this->t('Documents'),
      ],
      '#description' => $this->t('Select which media types should be automatically signed.'),
    ];

    $form['badge'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Verification Badge'),
      '#description' => $this->t('Configure the C2PA verification badge display.'),
    ];

    $form['badge']['enable_badge'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable verification badge'),
      '#default_value' => $config->get('enable_badge') !== false,
      '#description' => $this->t('Show the C2PA verification badge on signed media.'),
    ];

    $form['badge']['badge_position'] = [
      '#type' => 'select',
      '#title' => $this->t('Badge Position'),
      '#default_value' => $config->get('badge_position') ?: 'bottom-right',
      '#options' => [
        'top-left' => $this->t('Top Left'),
        'top-right' => $this->t('Top Right'),
        'bottom-left' => $this->t('Bottom Left'),
        'bottom-right' => $this->t('Bottom Right'),
      ],
      '#states' => [
        'visible' => [
          ':input[name="enable_badge"]' => ['checked' => TRUE],
        ],
      ],
    ];

    $form['security'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Security Settings'),
      '#description' => $this->t('Security and compliance configuration.'),
    ];

    $form['security']['enforce_https'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enforce HTTPS'),
      '#default_value' => $config->get('enforce_https') !== false,
      '#description' => $this->t('Strict HTTPS enforcement for all C2PA operations. Recommended for security.'),
    ];

    $form['security']['enable_hsts'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable HSTS'),
      '#default_value' => $config->get('enable_hsts') !== false,
      '#description' => $this->t('Add HTTP Strict Transport Security headers for enhanced security.'),
    ];

    $form['analytics'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Analytics & Telemetry'),
      '#description' => $this->t('Configure usage analytics and health monitoring.'),
    ];

    $form['analytics']['enable_telemetry'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable telemetry'),
      '#default_value' => $config->get('enable_telemetry') !== false,
      '#description' => $this->t('Send anonymous usage and health data to improve the service.'),
    ];

    $form['analytics']['analytics_url'] = [
      '#type' => 'url',
      '#title' => $this->t('Analytics Endpoint'),
      '#default_value' => $config->get('analytics_url') ?: 'https://analytics.c2concierge.org/telemetry',
      '#states' => [
        'visible' => [
          ':input[name="enable_telemetry"]' => ['checked' => TRUE],
        ],
      ],
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $config = $this->config('c2c_c2pa.settings');
    
    // Save all form values
    $values = $form_state->getValues();
    
    // Handle API key special case (don't overwrite if empty)
    if (empty($values['api_key'])) {
      unset($values['api_key']);
    } else {
      // CRITICAL: Validate API key strength
      if (!$this->validateApiKey($values['api_key'])) {
        $form_state->setErrorByName('api_key', $this->t('API key must be at least 32 characters long and contain letters, numbers, and symbols.'));
        return;
      }
    }
    
    // Filter supported media types to only checked values
    if (isset($values['supported_media_types'])) {
      $values['supported_media_types'] = array_filter($values['supported_media_types']);
    }
    
    foreach ($values as $key => $value) {
      if (!str_starts_with($key, 'form_') && !in_array($key, ['submit', 'form_build_id', 'form_token', 'form_id', 'op'])) {
        $config->set($key, $value);
      }
    }
    
    $config->save();
    
    parent::submitForm($form, $form_state);
    
}

/**
 * {@inheritdoc}
 */
public function submitForm(array &$form, FormStateInterface $form_state): void {
  $config = $this->config('c2c_c2pa.settings');
  
  // Save all form values
  $values = $form_state->getValues();
  
  // Handle API key special case (don't overwrite if empty)
  if (empty($values['api_key'])) {
    unset($values['api_key']);
  } else {
    // CRITICAL: Validate API key strength
    if (!$this->validateApiKey($values['api_key'])) {
      $form_state->setErrorByName('api_key', $this->t('API key must be at least 32 characters long and contain letters, numbers, and symbols.'));
      return;
    }
  }
  
  // Filter supported media types to only checked values
  if (isset($values['supported_media_types'])) {
    $values['supported_media_types'] = array_filter($values['supported_media_types']);
  }
  
  foreach ($values as $key => $value) {
    if (!str_starts_with($key, 'form_') && !in_array($key, ['submit', 'form_build_id', 'form_token', 'form_id', 'op'])) {
      $config->set($key, $value);
    }
  }
  
  $config->save();
  
  parent::submitForm($form, $form_state);
  
  // Clear caches to apply new configuration
  \Drupal::service('cache.render')->invalidateAll();
}

/**
 * CRITICAL: Validate HTTPS URLs
 */
public static function validateHttpsUrl(array $element, FormStateInterface $form_state): void {
  $url = $element['#value'];
  
  if (empty($url)) {
    return;
  }
  
  if (!filter_var($url, FILTER_VALIDATE_URL) || !str_starts_with($url, 'https://')) {
    $form_state->setError($element, t('The URL must be a valid HTTPS URL.'));
    return;
  }
  
  $host = parse_url($url, PHP_URL_HOST);
  $allowedDomains = [
    'verify.c2concierge.org',
    'manifests.c2concierge.org',
    'cdn.c2concierge.org',
    'analytics.c2concierge.org'
  ];
  
  if (!in_array($host, $allowedDomains)) {
    $form_state->setError($element, t('The URL must be from an allowed domain: @domains', [
      '@domains' => implode(', ', $allowedDomains)
    ]));
  }
}

/**
 * CRITICAL: Validate API key strength and format
 */
public static function validateApiKey(array $element, FormStateInterface $form_state): void {
  $apiKey = $element['#value'];
  
  if (empty($apiKey)) {
    return; // Allow empty to keep existing value
  }
  
  if (strlen($apiKey) < 32) {
    $form_state->setError($element, t('API key must be at least 32 characters long.'));
    return;
  }
  
  if (!preg_match('/[A-Z]/', $apiKey)) {
    $form_state->setError($element, t('API key must contain at least one uppercase letter.'));
    return;
  }
  
  if (!preg_match('/[a-z]/', $apiKey)) {
    $form_state->setError($element, t('API key must contain at least one lowercase letter.'));
    return;
  }
  
  if (!preg_match('/[0-9]/', $apiKey)) {
    $form_state->setError($element, t('API key must contain at least one number.'));
    return;
  }
  
  if (!preg_match('/[!@#$%^&*()_+\-=\[\]{};\':"\|,.<>\/?]/', $apiKey)) {
    $form_state->setError($element, t('API key must contain at least one special symbol.'));
    return;
  }
  
  // Check for common weak patterns
  $weakPatterns = [
    '/password/i',
    '/secret/i',
    '/key/i',
    '/123456/',
    '/abcdef/',
    '/qwerty/i',
  ];
  
  foreach ($weakPatterns as $pattern) {
    if (preg_match($pattern, $apiKey)) {
      $form_state->setError($element, t('API key contains common weak patterns. Please use a more secure key.'));
      return;
    }
  }
}

/**
 * Validate number range
 */
public static function validateNumberRange(array $element, FormStateInterface $form_state): void {
  $value = $element['#value'];
  $min = $element['#min'] ?? 1;
  $max = $element['#max'] ?? 100;
  
  if (!is_numeric($value) || $value < $min || $value > $max) {
    $form_state->setError($element, t('The value must be between @min and @max.', [
      '@min' => $min,
      '@max' => $max
    ]));
  }
}
