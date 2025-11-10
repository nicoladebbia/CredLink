/**
 * Phase 35 Leaderboard - Playbook Generator
 * Generates "Get to Green in 15 Minutes" playbooks for each vendor
 */

import { 
  Playbook, 
  PlaybookStep, 
  VerificationStep, 
  Resource,
  Vendor,
  VendorScores,
  DimensionScore
} from '@/types';
import { VENDORS } from '@/config/vendors';

export interface PlaybookGeneratorConfig {
  includeCodeExamples: boolean;
  includeCurlCommands: boolean;
  includeVerificationSteps: boolean;
  difficulty: 'easy' | 'medium' | 'hard' | 'all';
}

export class PlaybookGenerator {
  private config: PlaybookGeneratorConfig;

  constructor(config: PlaybookGeneratorConfig) {
    this.config = config;
  }

  /**
   * Generate comprehensive playbook for a vendor
   */
  generatePlaybook(
    vendorId: string,
    currentScores: VendorScores,
    targetScore: number = 90
  ): Playbook {
    const vendor = VENDORS.find(v => v.id === vendorId);
    if (!vendor) {
      throw new Error(`Vendor not found: ${vendorId}`);
    }

    const playbook: Playbook = {
      vendorId,
      vendorName: vendor.name,
      category: vendor.category,
      currentScore: currentScores.default,
      targetScore,
      estimatedTimeMinutes: this.estimateTotalTime(currentScores, targetScore),
      difficulty: this.assessOverallDifficulty(currentScores, targetScore),
      steps: [],
      prerequisites: this.identifyPrerequisites(currentScores),
      verification: this.generateVerificationSteps(vendor),
      resources: this.generateResources(vendor)
    };

    // Generate specific steps based on vendor and score gaps
    playbook.steps = this.generatePlaybookSteps(vendor, currentScores, targetScore);

    return playbook;
  }

  /**
   * Generate vendor-specific playbook steps
   */
  private generatePlaybookSteps(
    vendor: Vendor,
    scores: VendorScores,
    targetScore: number
  ): PlaybookStep[] {
    const steps: PlaybookStep[] = [];
    let stepOrder = 1;

    // Analyze score gaps and generate targeted steps
    for (const dimension of scores.dimensions) {
      const gap = targetScore - dimension.bestPracticeScore;
      if (gap > 0) {
        const dimensionSteps = this.generateStepsForDimension(
          vendor,
          dimension,
          gap,
          stepOrder
        );
        steps.push(...dimensionSteps);
        stepOrder += dimensionSteps.length;
      }
    }

    // Add validation and testing steps
    steps.push(...this.generateValidationSteps(vendor, stepOrder));

    return steps;
  }

  /**
   * Generate steps for specific scoring dimension
   */
  private generateStepsForDimension(
    vendor: Vendor,
    dimension: DimensionScore,
    gap: number,
    startOrder: number
  ): PlaybookStep[] {
    const steps: PlaybookStep[] = [];

    switch (dimension.dimensionId) {
      case 'embedded-manifest-survival':
        steps.push(...this.generateEmbeddedManifestSteps(vendor, gap, startOrder));
        break;
      
      case 'remote-manifest-honored':
        steps.push(...this.generateRemoteManifestSteps(vendor, gap, startOrder));
        break;
      
      case 'verifier-discovery-reliability':
        steps.push(...this.generateReliabilitySteps(vendor, gap, startOrder));
        break;
      
      case 'docs-alignment':
        steps.push(...this.generateDocsAlignmentSteps(vendor, gap, startOrder));
        break;
      
      case 'reproducibility':
        steps.push(...this.generateReproducibilitySteps(vendor, gap, startOrder));
        break;
    }

    return steps;
  }

  /**
   * Generate embedded manifest preservation steps
   */
  private generateEmbeddedManifestSteps(
    vendor: Vendor,
    gap: number,
    startOrder: number
  ): PlaybookStep[] {
    const steps: PlaybookStep[] = [];
    let order = startOrder;

    if (vendor.id === 'cloudflare-images') {
      steps.push({
        id: 'cf-enable-preserve-credentials',
        order: order++,
        title: 'Enable Preserve Content Credentials',
        description: 'Enable C2PA Content Credentials preservation in Cloudflare Images',
        type: 'ui',
        content: `1. Log in to Cloudflare dashboard
2. Navigate to Images > Transformations
3. Toggle "Preserve Content Credentials" to Enabled
4. Save changes`,
        expectedOutcome: 'C2PA manifests are preserved during image transformations',
        verification: 'Test with a signed image and verify manifest survives transforms',
        estimatedMinutes: 3
      });

      steps.push({
        id: 'cf-metadata-settings',
        order: order++,
        title: 'Configure Metadata Settings',
        description: 'Ensure metadata preservation is properly configured',
        type: 'config',
        content: `Add metadata=all to transformation parameters:
?w=800&h=600&metadata=all&preserve-credentials=true`,
        expectedOutcome: 'All metadata including C2PA is preserved',
        verification: 'Check response headers and verify C2PA data',
        estimatedMinutes: 2
      });
    }

    if (vendor.id === 'fastly-image-optimizer') {
      steps.push({
        id: 'fastly-metadata-all',
        order: order++,
        title: 'Add metadata=all Parameter',
        description: 'Include metadata preservation in Fastly IO requests',
        type: 'code',
        content: `Update Fastly IO URLs to include metadata parameter:
https://your-fastly-domain.io/image.jpg?w=800&h=600&metadata=all`,
        expectedOutcome: 'Metadata including C2PA Content Credentials is preserved',
        verification: 'Test transformation and verify embedded manifest',
        estimatedMinutes: 2
      });
    }

    if (vendor.id === 'akamai-ivm') {
      steps.push({
        id: 'akamai-preserve-xmp',
        order: order++,
        title: 'Enable Preserve XMP in Policy',
        description: 'Configure Akamai IVM policy to preserve XMP metadata',
        type: 'ui',
        content: `1. Access Akamai Control Center
2. Navigate to Image & Video Manager > Policies
3. Edit your image policy
4. Set "Preserve XMP" to true
5. Save and deploy policy`,
        expectedOutcome: 'XMP metadata containing C2PA data is preserved',
        verification: 'Test image transformation and verify C2PA manifest',
        estimatedMinutes: 5
      });
    }

    if (vendor.id === 'cloudinary') {
      steps.push({
        id: 'cloudinary-c2pa-provenance',
        order: order++,
        title: 'Enable C2PA Provenance Features',
        description: 'Join C2PA program and enable provenance features',
        type: 'api',
        content: `Add C2PA flags to transformation URLs:
https://res.cloudinary.com/demo/image/upload/fl_c2pa_provenance,preserve_metadata/image.jpg`,
        expectedOutcome: 'C2PA provenance data is preserved in transformations',
        verification: 'Verify with Cloudinary\'s C2PA verification tools',
        estimatedMinutes: 7
      });
    }

    if (vendor.id === 'wordpress-core') {
      steps.push({
        id: 'wp-disable-strip-meta',
        order: order++,
        title: 'Disable Image Metadata Stripping',
        description: 'Add filter to preserve image metadata during processing',
        type: 'code',
        content: `Add to functions.php or theme:
add_filter('image_strip_meta', false);
add_filter('wp_editor_set_quality', function($quality) {
    return 85; // Maintain reasonable quality
});`,
        expectedOutcome: 'WordPress preserves C2PA metadata in processed images',
        verification: 'Upload a signed image and check thumbnails for C2PA data',
        estimatedMinutes: 3
      });

      steps.push({
        id: 'wp-regenerate-thumbnails',
        order: order++,
        title: 'Regenerate Existing Thumbnails',
        description: 'Regenerate thumbnails to apply metadata preservation',
        type: 'code',
        content: `Use WP-CLI to regenerate thumbnails:
wp media regenerate --yes
Or use a plugin like "Regenerate Thumbnails"`,
        expectedOutcome: 'All image sizes include C2PA metadata',
        verification: 'Check various thumbnail sizes for C2PA manifests',
        estimatedMinutes: 5
      });
    }

    return steps;
  }

  /**
   * Generate remote manifest preservation steps
   */
  private generateRemoteManifestSteps(
    vendor: Vendor,
    gap: number,
    startOrder: number
  ): PlaybookStep[] {
    const steps: PlaybookStep[] = [];
    let order = startOrder;

    steps.push({
      id: 'implement-link-headers',
      order: order++,
      title: 'Implement Link Header for Remote Manifest',
      description: 'Add Link: rel="c2pa-manifest" header to image responses',
      type: 'code',
      content: `Add to your CDN/proxy configuration:
Link: <https://your-domain.com/manifests/{hash}>; rel="c2pa-manifest"; type="application/c2pa"

For nginx:
add_header "Link" '<https://your-domain.com/manifests/$arg_manifest_hash>; rel="c2pa-manifest"; type="application/c2pa"';`,
      expectedOutcome: 'Remote manifest is discoverable via Link header',
      verification: 'Check response headers for Link header with c2pa-manifest',
      estimatedMinutes: 4
    });

    steps.push({
      id: 'host-remote-manifests',
      order: order++,
      title: 'Host Remote Manifest Files',
      description: 'Set up hosting for remote C2PA manifest files',
      type: 'config',
      content: `1. Extract manifests from signed images
2. Host at accessible URLs
3. Ensure proper CORS headers:
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD
Access-Control-Allow-Headers: Content-Type`,
      expectedOutcome: 'Remote manifests are accessible and properly configured',
      verification: 'Test manifest URL accessibility and CORS compliance',
      estimatedMinutes: 6
    });

    return steps;
  }

  /**
   * Generate verification reliability steps
   */
  private generateReliabilitySteps(
    vendor: Vendor,
    gap: number,
    startOrder: number
  ): PlaybookStep[] {
    const steps: PlaybookStep[] = [];
    let order = startOrder;

    steps.push({
      id: 'optimize-caching',
      order: order++,
      title: 'Optimize Caching for Manifest Discovery',
      description: 'Configure caching headers for reliable manifest access',
      type: 'config',
      content: `Set appropriate caching headers:
Cache-Control: public, max-age=31536000, immutable
ETag: "{manifest-hash}"
Last-Modified: "{timestamp}"`,
      expectedOutcome: 'Fast and reliable manifest discovery',
      verification: 'Test manifest access latency and caching behavior',
      estimatedMinutes: 3
    });

    steps.push({
      id: 'monitor-performance',
      order: order++,
      title: 'Set Up Performance Monitoring',
      description: 'Monitor manifest discovery performance and reliability',
      type: 'code',
      content: `Implement monitoring for:
- Manifest response times
- Success rates
- Error patterns
- Geographic performance

Use tools like:
- Cloudflare Analytics
- Pingdom
- Custom monitoring scripts`,
      expectedOutcome: 'Proactive monitoring of manifest reliability',
      verification: 'Verify monitoring alerts and dashboards are working',
      estimatedMinutes: 4
    });

    return steps;
  }

  /**
   * Generate documentation alignment steps
   */
  private generateDocsAlignmentSteps(
    vendor: Vendor,
    gap: number,
    startOrder: number
  ): PlaybookStep[] {
    const steps: PlaybookStep[] = [];
    let order = startOrder;

    steps.push({
      id: 'review-current-docs',
      order: order++,
      title: 'Review Current Documentation',
      description: 'Audit vendor documentation for C2PA accuracy',
      type: 'documentation',
      content: `1. Read vendor\'s current C2PA documentation
2. Compare with actual behavior
3. Note discrepancies
4. Document findings for internal reference`,
      expectedOutcome: 'Clear understanding of documentation gaps',
      verification: 'Document all inconsistencies between docs and behavior',
      estimatedMinutes: 5
    });

    steps.push({
      id: 'update-internal-docs',
      order: order++,
      title: 'Update Internal Documentation',
      description: 'Create accurate internal documentation',
      type: 'documentation',
      content: `Create internal guides covering:
- Actual C2PA behavior
- Configuration requirements
- Troubleshooting steps
- Best practices`,
      expectedOutcome: 'Team has accurate documentation for implementation',
      verification: 'Review and validate internal documentation',
      estimatedMinutes: 3
    });

    return steps;
  }

  /**
   * Generate reproducibility steps
   */
  private generateReproducibilitySteps(
    vendor: Vendor,
    gap: number,
    startOrder: number
  ): PlaybookStep[] {
    const steps: PlaybookStep[] = [];
    let order = startOrder;

    steps.push({
      id: 'standardize-processing',
      order: order++,
      title: 'Standardize Image Processing Pipeline',
      description: 'Ensure consistent C2PA handling across all endpoints',
      type: 'config',
      content: `1. Audit all image processing endpoints
2. Standardize C2PA preservation settings
3. Implement consistent parameter naming
4. Test across all transformation types`,
      expectedOutcome: 'Consistent C2PA behavior across all image operations',
      verification: 'Test various endpoints and transformations for consistency',
      estimatedMinutes: 6
    });

    steps.push({
      id: 'implement-testing',
      order: order++,
      title: 'Implement Automated Testing',
      description: 'Set up automated tests for C2PA preservation',
      type: 'code',
      content: `Create test suite that:
- Tests all transformation types
- Verifies manifest preservation
- Checks remote manifest discovery
- Runs on deployment

Example test framework:
- Jest/Playwright for automation
- c2patool for verification
- CI/CD integration`,
      expectedOutcome: 'Automated verification of C2PA preservation',
      verification: 'Run test suite and verify all tests pass',
      estimatedMinutes: 8
    });

    return steps;
  }

  /**
   * Generate validation steps
   */
  private generateValidationSteps(vendor: Vendor, startOrder: number): PlaybookStep[] {
    const steps: PlaybookStep[] = [];
    let order = startOrder;

    steps.push({
      id: 'comprehensive-testing',
      order: order++,
      title: 'Comprehensive C2PA Testing',
      description: 'Test C2PA preservation across all transformation scenarios',
      type: 'code',
      content: `Test with various image formats and transformations:
1. JPEG → WebP conversion
2. PNG → AVIF conversion
3. Resize and crop operations
4. Quality adjustments
5. Multiple transformation chains
6. Edge cases and error conditions`,
      expectedOutcome: 'C2PA preservation verified across all scenarios',
      verification: 'All test cases pass with manifest preservation',
      estimatedMinutes: 10
    });

    steps.push({
      id: 'production-validation',
      order: order++,
      title: 'Production Environment Validation',
      description: 'Validate C2PA behavior in production environment',
      type: 'config',
      content: `1 Deploy changes to staging first
2. Test with production-like traffic
3. Monitor performance impact
4. Validate with real-world images
5. Check CDN behavior and caching`,
      expectedOutcome: 'C2PA preservation working in production conditions',
      verification: 'Production monitoring shows successful C2PA preservation',
      estimatedMinutes: 7
    });

    return steps;
  }

  /**
   * Generate verification steps
   */
  private generateVerificationSteps(vendor: Vendor): VerificationStep[] {
    return [
      {
        title: 'Verify Embedded Manifest',
        command: `c2patool transformed-image.jpg --output json`,
        expectedOutput: 'Manifest found and valid',
        successCriteria: 'Manifest data present in output and validation passes'
      },
      {
        title: 'Check Remote Manifest Link',
        command: `curl -I "https://your-cdn.com/transformed-image.jpg" | grep -i link`,
        expectedOutput: 'Link: <...>; rel="c2pa-manifest"',
        successCriteria: 'Link header present with c2pa-manifest rel'
      },
      {
        title: 'Test Remote Manifest Access',
        command: `curl -I "https://your-domain.com/manifests/{hash}"`,
        expectedOutput: 'HTTP/2 200',
        successCriteria: 'Remote manifest returns 200 status'
      },
      {
        title: 'Verify with CAI Tool',
        command: `cai-verify transformed-image.jpg --format json`,
        expectedOutput: 'C2PA assertions found and verified',
        successCriteria: 'CAI verification shows valid C2PA data'
      }
    ];
  }

  /**
   * Generate resources section
   */
  private generateResources(vendor: Vendor): Resource[] {
    const resources: Resource[] = [];

    // Add vendor documentation
    resources.push({
      type: 'documentation',
      title: `${vendor.name} Documentation`,
      url: vendor.docsUrl,
      description: 'Official vendor documentation for C2PA features'
    });

    // Add C2PA tools
    resources.push({
      type: 'tool',
      title: 'C2PA Verify Tool',
      url: 'https://opensource.contentauthenticity.org/',
      description: 'Open source C2PA verification tools'
    });

    resources.push({
      type: 'tool',
      title: 'c2patool',
      url: 'https://github.com/contentauth/c2patool',
      description: 'Command-line tool for C2PA content credentials'
    });

    // Add support resources
    if (vendor.supportUrl) {
      resources.push({
        type: 'support',
        title: `${vendor.name} Support`,
        url: vendor.supportUrl,
        description: 'Vendor support for C2PA implementation'
      });
    }

    // Add examples
    resources.push({
      type: 'example',
      title: 'C2PA Implementation Examples',
      url: 'https://github.com/contentauth/c2pa-examples',
      description: 'Sample implementations and code examples'
    });

    return resources;
  }

  /**
   * Identify prerequisites for improvement
   */
  private identifyPrerequisites(scores: VendorScores): string[] {
    const prerequisites: string[] = [];

    // Check if vendor has C2PA support
    const needsC2paSupport = scores.dimensions.some(d => 
      d.dimensionId === 'embedded-manifest-survival' && d.defaultScore < 50
    );
    if (needsC2paSupport) {
      prerequisites.push('Vendor supports C2PA Content Credentials');
      prerequisites.push('Access to vendor C2PA features or beta program');
    }

    // Check if remote manifests needed
    const needsRemoteManifests = scores.dimensions.some(d => 
      d.dimensionId === 'remote-manifest-honored' && d.defaultScore < 50
    );
    if (needsRemoteManifests) {
      prerequisites.push('Ability to host remote manifest files');
      prerequisites.push('Control over HTTP response headers');
    }

    // Check if technical expertise needed
    const needsTechnicalChanges = scores.dimensions.some(d => d.change > 0);
    if (needsTechnicalChanges) {
      prerequisites.push('Access to CDN/proxy configuration');
      prerequisites.push('Understanding of HTTP headers and caching');
      prerequisites.push('Command-line tool proficiency');
    }

    return prerequisites;
  }

  /**
   * Estimate total time for improvement
   */
  private estimateTotalTime(scores: VendorScores, targetScore: number): number {
    const currentScore = scores.default;
    const gap = targetScore - currentScore;
    
    if (gap <= 0) return 0;
    
    // Base time estimation
    const baseTimePerPoint = 2; // 2 minutes per point improvement
    const estimatedTime = gap * baseTimePerPoint;
    
    // Adjust based on difficulty
    const difficultyMultiplier = 
      scores.improvement.difficulty === 'easy' ? 1.0 :
      scores.improvement.difficulty === 'medium' ? 1.5 : 2.0;
    
    return Math.round(estimatedTime * difficultyMultiplier);
  }

  /**
   * Assess overall difficulty
   */
  private assessOverallDifficulty(scores: VendorScores, targetScore: number): 'easy' | 'medium' | 'hard' {
    const gap = targetScore - scores.default;
    const configChanges = scores.improvement.configChangesNeeded;
    
    if (gap <= 20 && configChanges <= 2) {
      return 'easy';
    } else if (gap <= 40 && configChanges <= 5) {
      return 'medium';
    } else {
      return 'hard';
    }
  }
}
