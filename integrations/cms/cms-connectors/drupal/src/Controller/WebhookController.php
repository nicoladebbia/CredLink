<?php

namespace Drupal\c2c_c2pa\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;

/**
 * Handles C2PA webhook callbacks.
 */
class WebhookController extends ControllerBase {

  /**
   * The config factory.
   */
  protected ConfigFactoryInterface $configFactory;

  /**
   * The logger.
   */
  protected $logger;

  /**
   * Constructs a WebhookController object.
   */
  public function __construct(
    ConfigFactoryInterface $config_factory,
    LoggerChannelFactoryInterface $logger_factory
  ) {
    $this->configFactory = $config_factory;
    $this->logger = $logger_factory->get('c2c_c2pa');
  }

  /**
   * Handles incoming webhook requests.
   */
  public function handle(Request $request): JsonResponse {
    try {
      // Validate request method
      if ($request->getMethod() !== 'POST') {
        return new JsonResponse(['error' => 'Method not allowed'], 405);
      }

      // Get and validate JSON payload
      $content = $request->getContent();
      if (empty($content)) {
        return new JsonResponse(['error' => 'Empty request body'], 400);
      }

      $data = json_decode($content, true);
      if (json_last_error() !== JSON_ERROR_NONE) {
        return new JsonResponse(['error' => 'Invalid JSON'], 400);
      }

      // Validate webhook signature if configured
      if (!$this->validateWebhookSignature($request, $data)) {
        return new JsonResponse(['error' => 'Invalid signature'], 401);
      }

      // Process webhook event
      $result = $this->processWebhookEvent($data);

      return new JsonResponse([
        'status' => 'success',
        'processed' => $result['processed'],
        'message' => $result['message'],
      ]);

    } catch (\Exception $e) {
      $this->logger->error('Webhook processing failed: @message', [
        '@message' => $e->getMessage(),
      ]);

      return new JsonResponse([
        'error' => 'Internal server error',
        'message' => $e->getMessage(),
      ], 500);
    }
  }

  /**
   * Validates webhook signature.
   */
  protected function validateWebhookSignature(Request $request, array $data): bool {
    $config = $this->configFactory->get('c2c_c2pa.settings');
    $webhook_secret = $config->get('webhook_secret');

    // Skip validation if no secret configured
    if (empty($webhook_secret)) {
      return true;
    }

    $signature = $request->headers->get('X-C2C-Signature');
    if (empty($signature)) {
      return false;
    }

    $expected_signature = hash_hmac('sha256', $request->getContent(), $webhook_secret);
    return hash_equals($expected_signature, $signature);
  }

  /**
   * Processes webhook event.
   */
  protected function processWebhookEvent(array $data): array {
    $event = $data['event'] ?? 'unknown';
    $this->logger->info('Processing webhook event: @event', ['@event' => $event]);

    switch ($event) {
      case 'manifest.created':
        return $this->handleManifestCreated($data);
      
      case 'manifest.updated':
        return $this->handleManifestUpdated($data);
      
      case 'media.verify':
        return $this->handleMediaVerify($data);
      
      case 'health.check':
        return $this->handleHealthCheck($data);
      
      default:
        return [
          'processed' => false,
          'message' => "Unknown event type: {$event}",
        ];
    }
  }

  /**
   * Handles manifest created event.
   */
  protected function handleManifestCreated(array $data): array {
    $manifest_url = $data['manifest_url'] ?? null;
    $media_id = $data['media_id'] ?? null;

    if (!$manifest_url || !$media_id) {
      return [
        'processed' => false,
        'message' => 'Missing required fields: manifest_url, media_id',
      ];
    }

    try {
      $media_storage = $this->entityTypeManager()->getStorage('media');
      $media = $media_storage->load($media_id);

      if (!$media) {
        return [
          'processed' => false,
          'message' => "Media {$media_id} not found",
        ];
      }

      // Update manifest URL
      if ($media->hasField('field_c2pa_manifest_url')) {
        $media->set('field_c2pa_manifest_url', $manifest_url);
        $media->save();

        $this->logger->info('Updated manifest URL for media @id', ['@id' => $media_id]);

        return [
          'processed' => true,
          'message' => "Manifest URL updated for media {$media_id}",
        ];
      } else {
        return [
          'processed' => false,
          'message' => "Media {$media_id} missing manifest field",
        ];
      }
    } catch (\Exception $e) {
      return [
        'processed' => false,
        'message' => "Failed to update media {$media_id}: " . $e->getMessage(),
      ];
    }
  }

  /**
   * Handles manifest updated event.
   */
  protected function handleManifestUpdated(array $data): array {
    // Similar to created but with additional validation
    return $this->handleManifestCreated($data);
  }

  /**
   * Handles media verification request.
   */
  protected function handleMediaVerify(array $data): array {
    $media_id = $data['media_id'] ?? null;

    if (!$media_id) {
      return [
        'processed' => false,
        'message' => 'Missing media_id',
      ];
    }

    try {
      $media_storage = $this->entityTypeManager()->getStorage('media');
      $media = $media_storage->load($media_id);

      if (!$media) {
        return [
          'processed' => false,
          'message' => "Media {$media_id} not found",
        ];
      }

      // Get verification status
      $manifest_url = $media->hasField('field_c2pa_manifest_url') 
        ? $media->get('field_c2pa_manifest_url')->value 
        : null;

      $file = $this->getMediaFile($media);
      $file_exists = $file && file_exists($file->getFileUri());

      return [
        'processed' => true,
        'message' => "Verification status retrieved for media {$media_id}",
        'data' => [
          'media_id' => $media_id,
          'manifest_url' => $manifest_url,
          'file_exists' => $file_exists,
          'status' => $manifest_url ? 'signed' : 'unsigned',
        ],
      ];
    } catch (\Exception $e) {
      return [
        'processed' => false,
        'message' => "Failed to verify media {$media_id}: " . $e->getMessage(),
      ];
    }
  }

  /**
   * Handles health check event.
   */
  protected function handleHealthCheck(array $data): array {
    try {
      // Check database connectivity
      $database = \Drupal::database();
      $database->query('SELECT 1')->fetchField();

      // Check media field exists
      $field_map = \Drupal::service('entity_field.manager')->getFieldMap();
      $has_manifest_field = isset($field_map['media']['field_c2pa_manifest_url']);

      // Check configuration
      $config = $this->configFactory->get('c2c_c2pa.settings');
      $is_configured = !empty($config->get('sign_url'));

      return [
        'processed' => true,
        'message' => 'Health check completed',
        'data' => [
          'database' => 'connected',
          'manifest_field' => $has_manifest_field ? 'present' : 'missing',
          'configuration' => $is_configured ? 'complete' : 'incomplete',
          'timestamp' => date('c'),
        ],
      ];
    } catch (\Exception $e) {
      return [
        'processed' => false,
        'message' => "Health check failed: " . $e->getMessage(),
      ];
    }
  }

  /**
   * Gets the file entity from media.
   */
  protected function getMediaFile($media) {
    if ($media->hasField('field_media_image') && !$media->get('field_media_image')->isEmpty()) {
      return $media->get('field_media_image')->entity;
    }

    if ($media->hasField('field_media_video_file') && !$media->get('field_media_video_file')->isEmpty()) {
      return $media->get('field_media_video_file')->entity;
    }

    if ($media->hasField('field_media_file') && !$media->get('field_media_file')->isEmpty()) {
      return $media->get('field_media_file')->entity;
    }

    return null;
  }

}
