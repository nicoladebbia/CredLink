<?php

namespace Drupal\c2c_c2pa\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;

/**
 * C2PA Link header injection subscriber.
 * 
 * Injects HTTP Link headers for C2PA manifests on media responses.
 * Follows D8-D10 Event Subscriber pattern (obsolete: drupal_add_http_header).
 */
final class C2PALinkSubscriber implements EventSubscriberInterface {

  /**
   * The entity type manager.
   */
  protected EntityTypeManagerInterface $entityTypeManager;

  /**
   * The current route match.
   */
  protected RouteMatchInterface $routeMatch;

  /**
   * Constructs a C2PALinkSubscriber object.
   */
  public function __construct(EntityTypeManagerInterface $entity_type_manager, RouteMatchInterface $route_match) {
    $this->entityTypeManager = $entity_type_manager;
    $this->routeMatch = $route_match;
  }

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    return [
      KernelEvents::RESPONSE => ['onRespond', -10],
    ];
  }

  /**
   * Injects C2PA Link header on media responses.
   */
  public function onRespond(ResponseEvent $event): void {
    $response = $event->getResponse();
    $request = $event->getRequest();
    
    // Only process HTML responses
    if (!$response->headers->get('Content-Type') || 
        !str_contains($response->headers->get('Content-Type'), 'text/html')) {
      return;
    }

    // Get manifest URL for current route/entity
    $manifestUrl = $this->getManifestUrlForRequest($request);
    
    if ($manifestUrl && $this->validateManifestUrl($manifestUrl)) {
      $linkHeader = sprintf('<%s>; rel="c2pa-manifest"', $manifestUrl);
      $response->headers->set('Link', $linkHeader, false);
      
      // Add HSTS header for security
      if ($request->isSecure()) {
        $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
    }
  }

  /**
   * Gets manifest URL for current request.
   */
  protected function getManifestUrlForRequest($request): ?string {
    $route_name = $this->routeMatch->getRouteName();
    
    // Handle media entity routes
    if (str_starts_with($route_name, 'entity.media.')) {
      $media = $this->routeMatch->getParameter('media');
      if ($media instanceof EntityInterface) {
        return $this->getManifestUrlForMedia($media);
      }
    }
    
    // Handle node routes with media references
    if (str_starts_with($route_name, 'entity.node.')) {
      $node = $this->routeMatch->getParameter('node');
      if ($node instanceof EntityInterface) {
        return $this->getManifestUrlForNode($node);
      }
    }
    
    // Handle file download routes
    if ($route_name === 'system.file' || str_contains($route_name, 'download')) {
      $file = $this->routeMatch->getParameter('file');
      if ($file instanceof EntityInterface) {
        return $this->getManifestUrlForFile($file);
      }
    }
    
    return null;
  }

  /**
   * Gets manifest URL for media entity.
   */
  protected function getManifestUrlForMedia(EntityInterface $media): ?string {
    $manifest_url = $media->get('field_c2pa_manifest_url')->value;
    return $manifest_url ?: null;
  }

  /**
   * Gets manifest URL for node (checks referenced media).
   */
  protected function getManifestUrlForNode(EntityInterface $node): ?string {
    // Check for primary media reference
    if ($node->hasField('field_media') && !$node->get('field_media')->isEmpty()) {
      $media = $node->get('field_media')->entity;
      if ($media instanceof EntityInterface) {
        return $this->getManifestUrlForMedia($media);
      }
    }
    
    // Check for image fields
    foreach ($node->getFieldDefinitions() as $field_name => $field_definition) {
      if (str_starts_with($field_definition->getType(), 'image') || 
          str_starts_with($field_definition->getType(), 'file')) {
        if (!$node->get($field_name)->isEmpty()) {
          $file = $node->get($field_name)->entity;
          if ($file instanceof EntityInterface) {
            return $this->getManifestUrlForFile($file);
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Gets manifest URL for file entity.
   */
  protected function getManifestUrlForFile(EntityInterface $file): ?string {
    // Check if file has manifest URL field
    if ($file->hasField('field_c2pa_manifest_url')) {
      return $file->get('field_c2pa_manifest_url')->value;
    }
    
    // Look up via media usage
    $media_storage = $this->entityTypeManager->getStorage('media');
    $media_ids = $media_storage->getQuery()
      ->condition('field_media_image.target_id', $file->id())
      ->condition('status', 1)
      ->accessCheck(FALSE)
      ->execute();
    
    if ($media_ids) {
      $media = $media_storage->load(reset($media_ids));
      return $this->getManifestUrlForMedia($media);
    }
    
    return null;
  }

  /**
   * Validates manifest URL format and security.
   */
  protected function validateManifestUrl(string $url): bool {
    try {
      $parsed = parse_url($url);
      
      // Must be HTTPS
      if ($parsed['scheme'] !== 'https') {
        return false;
      }
      
      // Must be C2 Concierge domain
      if (!str_contains($parsed['host'], 'credlink.org')) {
        return false;
      }
      
      // Must have valid path
      if (empty($parsed['path'])) {
        return false;
      }
      
      return true;
    } catch (\Exception $e) {
      return false;
    }
  }

}
