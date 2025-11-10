<?php

namespace Drupal\c2c_c2pa\EventSubscriber;

use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\File\FileSystemInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\RequestException;

/**
 * Handles C2PA signing for media uploads.
 */
class C2PAMediaSubscriber {

  /**
   * The entity type manager.
   */
  protected EntityTypeManagerInterface $entityTypeManager;

  /**
   * The config factory.
   */
  protected ConfigFactoryInterface $configFactory;

  /**
   * The logger.
   */
  protected $logger;

  /**
   * The file system.
   */
  protected FileSystemInterface $fileSystem;

  /**
   * The HTTP client.
   */
  protected ClientInterface $httpClient;

  /**
   * Constructs a C2PAMediaSubscriber object.
   */
  public function __construct(
    EntityTypeManagerInterface $entity_type_manager,
    ConfigFactoryInterface $config_factory,
    LoggerChannelFactoryInterface $logger_factory,
    FileSystemInterface $file_system,
    ClientInterface $http_client
  ) {
    $this->entityTypeManager = $entity_type_manager;
    $this->configFactory = $config_factory;
    $this->logger = $logger_factory->get('c2c_c2pa');
    $this->fileSystem = $file_system;
    $this->httpClient = $http_client;
  }

  /**
   * Reacts to media entity insertion.
   */
  public function onMediaInsert(EntityInterface $media): void {
    if (!$this->shouldProcessMedia($media)) {
      return;
    }

    try {
      $this->processMediaAsset($media);
    } catch (\Exception $e) {
      $this->logger->error('Failed to process media asset @id: @message', [
        '@id' => $media->id(),
        '@message' => $e->getMessage(),
      ]);
    }
  }

  /**
   * Checks if media should be processed for C2PA signing.
   */
  protected function shouldProcessMedia(EntityInterface $media): bool {
    $config = $this->configFactory->get('c2c_c2pa.settings');
    
    // Check if auto-signing is enabled
    if (!$config->get('auto_sign_uploads')) {
      return false;
    }

    // Check if media type is supported
    $supported_types = $config->get('supported_media_types') ?: ['image', 'video'];
    $media_type = $media->bundle();
    
    if (!in_array($media_type, $supported_types)) {
      return false;
    }

    // Check if already processed
    if ($media->hasField('field_c2pa_manifest_url') && !empty($media->get('field_c2pa_manifest_url')->value)) {
      return false;
    }

    // Check if media has file source
    if (!$media->hasField('field_media_image') && !$media->hasField('field_media_video_file')) {
      return false;
    }

    return true;
  }

  /**
   * Processes media asset for C2PA signing.
   */
  protected function processMediaAsset(EntityInterface $media): void {
    $config = $this->configFactory->get('c2c_c2pa.settings');
    
    // Get the file entity
    $file = $this->getMediaFile($media);
    if (!$file) {
      return;
    }

    // Prepare asset data for signing
    $assetData = $this->prepareAssetData($file);
    
    // Call signing service
    $signResult = $this->callSigningService($assetData, [
      'media_id' => $media->id(),
      'media_type' => $media->bundle(),
      'file_id' => $file->id(),
      'filename' => $file->getFilename(),
    ]);

    // Store manifest URL
    $this->storeManifestUrl($media, $signResult['manifest_url']);
    
    // Send telemetry
    $this->sendTelemetry('media_signed', [
      'media_id' => $media->id(),
      'manifest_url' => $signResult['manifest_url'],
    ]);

    $this->logger->info('Successfully signed media asset @id with manifest @url', [
      '@id' => $media->id(),
      '@url' => $signResult['manifest_url'],
    ]);
  }

  /**
   * Gets the file entity from media.
   */
  protected function getMediaFile(EntityInterface $media): ?EntityInterface {
    // Check image field
    if ($media->hasField('field_media_image') && !$media->get('field_media_image')->isEmpty()) {
      return $media->get('field_media_image')->entity;
    }

    // Check video field
    if ($media->hasField('field_media_video_file') && !$media->get('field_media_video_file')->isEmpty()) {
      return $media->get('field_media_video_file')->entity;
    }

    // Check file field
    if ($media->hasField('field_media_file') && !$media->get('field_media_file')->isEmpty()) {
      return $media->get('field_media_file')->entity;
    }

    return null;
  }

  /**
   * Prepares asset data for signing service.
   */
  protected function prepareAssetData(EntityInterface $file): array {
    $file_uri = $file->getFileUri();
    $real_path = $this->fileSystem->realpath($file_uri);
    
    if (!$real_path || !file_exists($real_path)) {
      throw new \RuntimeException('Cannot access file for signing');
    }

    $file_data = file_get_contents($real_path);
    $base64_data = base64_encode($file_data);

    return [
      'filename' => $file->getFilename(),
      'mime_type' => $file->getMimeType(),
      'size' => $file->getSize(),
      'data' => $base64_data,
      'uri' => $file_uri,
    ];
  }

  /**
   * Calls the C2PA signing service.
   */
  protected function callSigningService(array $assetData, array $metadata): array {
    $config = $this->configFactory->get('c2c_c2pa.settings');
    $signUrl = $config->get('sign_url') ?: 'https://verify.c2concierge.org/sign';
    $apiKey = $config->get('api_key');

    $payload = [
      'asset' => $assetData,
      'metadata' => array_merge($metadata, [
        'platform' => 'drupal',
        'timestamp' => date('c'),
        'remote_only' => $config->get('remote_only') !== false,
      ]),
    ];

    $options = [
      'json' => $payload,
      'headers' => [
        'Content-Type' => 'application/json',
        'X-C2C-Platform' => 'drupal',
        'X-C2C-Version' => '1.0.0',
      ],
      'timeout' => 30,
    ];

    if ($apiKey) {
      $options['headers']['Authorization'] = 'Bearer ' . $apiKey;
    }

    try {
      $response = $this->httpClient->post($signUrl, $options);
      $body = $response->getBody()->getContents();
      $result = json_decode($body, true);

      if (!$result || !isset($result['manifest_url'])) {
        throw new \RuntimeException('Invalid response from signing service');
      }

      return $result;
    } catch (RequestException $e) {
      $this->logger->error('Signing service request failed: @message', [
        '@message' => $e->getMessage(),
      ]);
      throw $e;
    }
  }

  /**
   * Stores manifest URL on media entity.
   */
  protected function storeManifestUrl(EntityInterface $media, string $manifestUrl): void {
    // Add field if it doesn't exist (for custom installations)
    if (!$media->hasField('field_c2pa_manifest_url')) {
      $this->logger->warning('Media entity @id missing field_c2pa_manifest_url field', [
        '@id' => $media->id(),
      ]);
      return;
    }

    $media->set('field_c2pa_manifest_url', $manifestUrl);
    $media->save();
  }

  /**
   * Sends telemetry data.
   */
  protected function sendTelemetry(string $event, array $data): void {
    $config = $this->configFactory->get('c2c_c2pa.settings');
    
    if (!$config->get('enable_telemetry')) {
      return;
    }

    $analyticsUrl = $config->get('analytics_url') ?: 'https://analytics.c2concierge.org/telemetry';

    try {
      $this->httpClient->post($analyticsUrl, [
        'json' => [
          'event' => $event,
          'platform' => 'drupal',
          'version' => '1.0.0',
          'timestamp' => date('c'),
          ...$data,
        ],
        'timeout' => 5,
      ]);
    } catch (RequestException $e) {
      // Silently fail telemetry to not break main functionality
      $this->logger->warning('Telemetry failed: @message', ['@message' => $e->getMessage()]);
    }
  }

}
