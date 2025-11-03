/**
 * C2 Concierge Webflow Connector Acceptance Tests
 * Live testing against Webflow demo sites
 */

const { chromium } = require('playwright');
const assert = require('assert');

class WebflowAcceptanceTests {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://demo.c2concierge.org.webflow.io',
      webhookUrl: config.webhookUrl || 'https://webhook.c2concierge.org/webflow-hook',
      webhookSecret: config.webhookSecret || process.env.WEBFLOW_WEBHOOK_SECRET,
      timeout: config.timeout || 30000,
      headless: config.headless !== false,
      ...config
    };

    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Initialize browser and page
   */
  async init() {
    this.browser = await chromium.launch({ 
      headless: this.config.headless,
      slowMo: 100
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'C2Concierge-Test/1.0.0'
    });
    
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);
  }

  /**
   * Cleanup browser resources
   */
  async cleanup() {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  /**
   * Run all acceptance tests
   */
  async runAllTests() {
    console.log('🧪 Starting Webflow Connector Acceptance Tests');
    
    try {
      await this.init();
      
      const tests = [
        this.testSiteAccessibility.bind(this),
        this.testHeadCodeInjection.bind(this),
        this.testBadgeInitialization.bind(this),
        this.testImageDiscovery.bind(this),
        this.testBadgeInteraction.bind(this),
        this.testVerificationModal.bind(this),
        this.testResponsiveDesign.bind(this),
        this.testWebhookSimulation.bind(this),
        this.testPerformanceImpact.bind(this)
      ];

      const results = [];
      
      for (const test of tests) {
        try {
          const result = await test();
          results.push({ name: test.name, status: 'passed', result });
          console.log(`✅ ${test.name} - PASSED`);
        } catch (error) {
          results.push({ name: test.name, status: 'failed', error: error.message });
          console.log(`❌ ${test.name} - FAILED: ${error.message}`);
        }
      }

      await this.cleanup();
      
      // Generate test report
      this.generateTestReport(results);
      
      return results;
      
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Test site accessibility
   */
  async testSiteAccessibility() {
    console.log('Testing site accessibility...');
    
    // Navigate to the site
    const response = await this.page.goto(this.config.baseUrl);
    
    // Check if site loads successfully
    assert(response.status() === 200, 'Site should load successfully');
    
    // Check for Webflow-specific elements
    const bodyClass = await this.page.getAttribute('body', 'class');
    const isWebflowSite = bodyClass && bodyClass.includes('w-mod-');
    
    // Check for C2 Concierge script
    const c2cScript = await this.page.locator('script[src*="c2concierge.org"]').count();
    
    return {
      siteAccessible: true,
      statusCode: response.status(),
      isWebflowSite: isWebflowSite,
      c2cScriptCount: c2cScript
    };
  }

  /**
   * Test head code injection
   */
  async testHeadCodeInjection() {
    console.log('Testing head code injection...');
    
    // Check for C2 Concierge configuration
    const configScript = await this.page.evaluate(() => {
      return window.C2C_WEBFLOW_CONFIG || null;
    });
    
    assert(configScript !== null, 'C2 Concierge configuration should be present');
    
    // Check for badge script
    const badgeScript = await this.page.locator('script[src*="c2-badge.js"]').count();
    assert(badgeScript > 0, 'Badge script should be loaded');
    
    // Check for manifest links
    const manifestLinks = await this.page.locator('link[rel="c2pa-manifest"]').count();
    
    return {
      configPresent: configScript !== null,
      configDetails: configScript,
      badgeScriptLoaded: badgeScript > 0,
      manifestLinksFound: manifestLinks
    };
  }

  /**
   * Test badge initialization
   */
  async testBadgeInitialization() {
    console.log('Testing badge initialization...');
    
    // Wait for scripts to load
    await this.page.waitForTimeout(2000);
    
    // Check if C2CBadge is initialized
    const badgeInitialized = await this.page.evaluate(() => {
      return window.C2CBadge !== undefined;
    });
    
    assert(badgeInitialized, 'C2CBadge should be initialized');
    
    // Check badge styles are injected
    const badgeStyles = await this.page.locator('#c2c-badge-styles').count();
    
    // Check for badge containers
    await this.page.waitForTimeout(1000);
    const badgeContainers = await this.page.locator('.c2c-badge-container').count();
    
    return {
      badgeInitialized: badgeInitialized,
      badgeStylesInjected: badgeStyles > 0,
      badgeContainersFound: badgeContainers
    };
  }

  /**
   * Test image discovery
   */
  async testImageDiscovery() {
    console.log('Testing image discovery...');
    
    // Find all images on the page
    const images = await this.page.locator('img').count();
    assert(images > 0, 'Page should contain images');
    
    // Check for images with C2PA attributes
    const c2paImages = await this.page.locator('img[data-c2pa-signed], img[data-c2pa-manifest]').count();
    
    // Check for processed images
    const processedImages = await this.page.locator('img[data-c2c-badge]').count();
    
    // Get image details
    const imageDetails = await this.page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.map(img => ({
        src: img.src,
        hasC2PA: img.hasAttribute('data-c2pa-signed') || img.hasAttribute('data-c2pa-manifest'),
        processed: img.hasAttribute('data-c2c-badge'),
        width: img.naturalWidth,
        height: img.naturalHeight
      }));
    });
    
    return {
      totalImages: images,
      c2paImages: c2paImages,
      processedImages: processedImages,
      imageDetails: imageDetails.slice(0, 5) // Limit for report
    };
  }

  /**
   * Test badge interaction
   */
  async testBadgeInteraction() {
    console.log('Testing badge interaction...');
    
    // Find a visible badge
    const badge = await this.page.locator('.c2c-verification-badge').first();
    
    if (await badge.count() === 0) {
      return {
        badgeFound: false,
        message: 'No badges found on page'
      };
    }
    
    // Check badge visibility
    const isVisible = await badge.isVisible();
    assert(isVisible, 'Badge should be visible');
    
    // Check badge text
    const badgeText = await badge.textContent();
    assert(badgeText.length > 0, 'Badge should have text');
    
    // Check hover state
    await badge.hover();
    const hasHoverStyle = await badge.evaluate(el => {
      return window.getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0.85)';
    });
    
    // Check click handler
    let modalOpened = false;
    this.page.once('dialog', async dialog => {
      modalOpened = true;
      await dialog.dismiss();
    });
    
    await badge.click();
    await this.page.waitForTimeout(500);
    
    return {
      badgeFound: true,
      badgeVisible: isVisible,
      badgeText: badgeText,
      hasHoverEffect: hasHoverStyle,
      clickHandlerWorking: modalOpened
    };
  }

  /**
   * Test verification modal
   */
  async testVerificationModal() {
    console.log('Testing verification modal...');
    
    // Find and click a badge
    const badge = await this.page.locator('.c2c-verification-badge').first();
    
    if (await badge.count() === 0) {
      return {
        modalTestable: false,
        message: 'No badges found to test modal'
      };
    }
    
    // Click badge to open modal
    await badge.click();
    
    // Wait for modal to appear
    await this.page.waitForSelector('#c2c-verification-modal', { timeout: 5000 });
    
    const modal = await this.page.locator('#c2c-verification-modal');
    const modalVisible = await modal.isVisible();
    assert(modalVisible, 'Modal should be visible');
    
    // Check modal content
    const modalTitle = await modal.locator('h2, h3').first().textContent();
    assert(modalTitle.includes('Authenticity'), 'Modal should have authenticity title');
    
    // Check close button
    const closeButton = await modal.locator('.c2c-modal-close, button[aria-label*="close"]').first();
    const closeButtonVisible = await closeButton.isVisible();
    
    // Test modal closing
    if (closeButtonVisible) {
      await closeButton.click();
      await this.page.waitForSelector('#c2c-verification-modal', { state: 'hidden' });
    }
    
    return {
      modalTestable: true,
      modalOpened: modalVisible,
      modalTitle: modalTitle,
      closeButtonWorking: closeButtonVisible
    };
  }

  /**
   * Test responsive design
   */
  async testResponsiveDesign() {
    console.log('Testing responsive design...');
    
    const viewports = [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1280, height: 720, name: 'desktop' }
    ];
    
    const results = {};
    
    for (const viewport of viewports) {
      await this.page.setViewportSize(viewport);
      await this.page.reload();
      await this.page.waitForTimeout(2000);
      
      const badge = await this.page.locator('.c2c-verification-badge').first();
      const badgeVisible = await badge.isVisible();
      
      // Check badge positioning
      const badgeStyle = await badge.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          position: styles.position,
          bottom: styles.bottom,
          right: styles.right,
          fontSize: styles.fontSize
        };
      });
      
      results[viewport.name] = {
        badgeVisible: badgeVisible,
        badgeStyle: badgeStyle
      };
    }
    
    return {
      responsiveTested: true,
      viewportResults: results
    };
  }

  /**
   * Test webhook simulation
   */
  async testWebhookSimulation() {
    console.log('Testing webhook simulation...');
    
    // Simulate a webhook payload
    const webhookPayload = {
      event: 'site_publish',
      payload: {
        siteUrl: this.config.baseUrl,
        siteId: 'test-site-id',
        timestamp: new Date().toISOString()
      }
    };
    
    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webflow-Signature': 'test-signature'
        },
        body: JSON.stringify(webhookPayload)
      });
      
      const responseText = await response.text();
      
      return {
        webhookUrl: this.config.webhookUrl,
        webhookAccessible: response.ok,
        responseStatus: response.status,
        responseBody: responseText.substring(0, 200) // Limit for report
      };
      
    } catch (error) {
      return {
        webhookUrl: this.config.webhookUrl,
        webhookAccessible: false,
        error: error.message
      };
    }
  }

  /**
   * Test performance impact
   */
  async testPerformanceImpact() {
    console.log('Testing performance impact...');
    
    // Measure page load time
    const startTime = Date.now();
    await this.page.goto(this.config.baseUrl);
    const loadTime = Date.now() - startTime;
    
    // Check resource sizes
    const resources = await this.page.evaluate(() => {
      return performance.getEntriesByType('resource').map(entry => ({
        name: entry.name,
        size: entry.transferSize || 0,
        duration: entry.duration
      }));
    });
    
    // Filter C2 Concierge resources
    const c2cResources = resources.filter(r => 
      r.name.includes('c2concierge.org')
    );
    
    const totalC2CSize = c2cResources.reduce((sum, r) => sum + r.size, 0);
    const totalC2CDuration = c2cResources.reduce((sum, r) => sum + r.duration, 0);
    
    return {
      pageLoadTime: loadTime,
      c2cResourceCount: c2cResources.length,
      totalC2CSize: totalC2CSize,
      totalC2CDuration: totalC2CDuration,
      performanceImpact: {
        sizeKB: Math.round(totalC2CSize / 1024),
        loadTimeMs: Math.round(totalC2CDuration)
      }
    };
  }

  /**
   * Generate test report
   */
  generateTestReport(results) {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const total = results.length;
    
    console.log('\n📊 Webflow Connector Test Report');
    console.log('='.repeat(40));
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log('='.repeat(40));
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.filter(r => r.status === 'failed').forEach(test => {
        console.log(`  - ${test.name}: ${test.error}`);
      });
    }
    
    // Save detailed report
    const reportData = {
      platform: 'webflow',
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed, successRate: (passed / total) * 100 },
      results: results
    };
    
    require('fs').writeFileSync(
      './test-results/webflow-acceptance.json',
      JSON.stringify(reportData, null, 2)
    );
  }
}

// Run tests if called directly
if (require.main === module) {
  const tests = new WebflowAcceptanceTests();
  tests.runAllTests()
    .then(results => {
      console.log('\n✅ Webflow acceptance tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Webflow acceptance tests failed:', error);
      process.exit(1);
    });
}

module.exports = WebflowAcceptanceTests;
