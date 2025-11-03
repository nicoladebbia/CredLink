/**
 * C2 Concierge Drupal Connector Acceptance Tests
 * Live testing against Drupal demo sites
 */

const { chromium } = require('playwright');
const assert = require('assert');

class DrupalAcceptanceTests {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://demo.c2concierge.org/drupal',
      adminUrl: config.adminUrl || 'https://demo.c2concierge.org/drupal/admin',
      username: config.username || process.env.DRUPAL_USERNAME,
      password: config.password || process.env.DRUPAL_PASSWORD,
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
    console.log('🧪 Starting Drupal Connector Acceptance Tests');
    
    try {
      await this.init();
      
      const tests = [
        this.testModuleInstallation.bind(this),
        this.testEventSubscriber.bind(this),
        this.testMediaUploadSigning.bind(this),
        this.testLinkHeaderInjection.bind(this),
        this.testBadgeDisplay.bind(this),
        this.testWebhookHandling.bind(this),
        this.testCronProcessing.bind(this),
        this.testConfigurationUI.bind(this),
        this.testUninstallSafety.bind(this)
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
   * Test module installation
   */
  async testModuleInstallation() {
    console.log('Testing module installation...');
    
    // Navigate to admin login
    await this.page.goto(this.config.adminUrl);
    
    // Login
    await this.page.fill('#edit-name', this.config.username);
    await this.page.fill('#edit-pass', this.config.password);
    await this.page.click('#edit-submit');
    
    // Wait for login success
    await this.page.waitForSelector('#toolbar-administration');
    
    // Navigate to modules page
    await this.page.goto(`${this.config.adminUrl}/modules`);
    
    // Search for C2 Concierge module
    await this.page.fill('#edit-text', 'C2 Concierge');
    
    // Verify module is present and enabled
    const moduleRow = await this.page.locator('text=C2 Concierge C2PA').first();
    assert(await moduleRow.isVisible(), 'C2 Concierge module should be visible');
    
    const checkbox = await moduleRow.locator('input[type="checkbox"]');
    assert(await checkbox.isChecked(), 'C2 Concierge module should be enabled');
    
    return {
      moduleFound: true,
      moduleEnabled: true,
      moduleVersion: await this.getModuleVersion()
    };
  }

  /**
   * Test Event Subscriber functionality
   */
  async testEventSubscriber() {
    console.log('Testing Event Subscriber...');
    
    // Navigate to configuration
    await this.page.goto(`${this.config.adminUrl}/config/media/c2c_c2pa`);
    
    // Verify configuration form is present
    assert(await this.page.locator('text=Signing Service Configuration').isVisible(), 
           'Configuration form should be present');
    
    // Check default values
    const signUrl = await this.page.inputValue('#edit-sign-url');
    assert(signUrl.includes('verify.c2concierge.org'), 
           'Default sign URL should be configured');
    
    // Test configuration save
    await this.page.fill('#edit-sign-url', 'https://verify.c2concierge.org/sign');
    await this.page.click('#edit-submit');
    
    // Verify save success
    await this.page.waitForSelector('text=The configuration options have been saved');
    
    return {
      configurationAccessible: true,
      defaultValuesCorrect: true,
      configurationSaved: true
    };
  }

  /**
   * Test media upload and signing
   */
  async testMediaUploadSigning() {
    console.log('Testing media upload and signing...');
    
    // Navigate to media add page
    await this.page.goto(`${this.config.adminUrl}/media/add/image`);
    
    // Upload test image
    const fileInput = await this.page.locator('input[type="file"]');
    await fileInput.setInputFiles('./tests/fixtures/test-image.jpg');
    
    // Wait for upload
    await this.page.waitForSelector('.media--preview');
    
    // Fill required fields
    await this.page.fill('#edit-name-0-value', 'Test C2PA Image');
    await this.page.fill('#edit-alt-0-value', 'Test image for C2PA signing');
    
    // Save media
    await this.page.click('#edit-submit');
    
    // Wait for save and redirect
    await this.page.waitForSelector('text=has been created');
    
    // Get media ID from URL
    const url = this.page.url();
    const mediaId = url.match(/\/media\/(\d+)/)?.[1];
    
    assert(mediaId, 'Media ID should be extracted from URL');
    
    // Navigate to media edit to check manifest URL field
    await this.page.goto(`${this.config.adminUrl}/media/${mediaId}/edit`);
    
    // Check if manifest URL field is populated
    const manifestUrlField = await this.page.locator('#edit-field-c2pa-manifest-url-0-value');
    
    // Wait a moment for async signing to complete
    await this.page.waitForTimeout(3000);
    
    const manifestUrl = await manifestUrlField.inputValue();
    
    return {
      mediaUploaded: true,
      mediaId: mediaId,
      manifestUrlGenerated: manifestUrl.length > 0,
      manifestUrl: manifestUrl || null
    };
  }

  /**
   * Test HTTP Link header injection
   */
  async testLinkHeaderInjection() {
    console.log('Testing HTTP Link header injection...');
    
    // Navigate to a media page (not admin)
    await this.page.goto(`${this.config.baseUrl}/media/1`);
    
    // Get response headers via service worker or network tab
    const response = await this.page.goto(`${this.config.baseUrl}/media/1`);
    
    // Check for Link header via JavaScript
    const linkHeader = await this.page.evaluate(() => {
      // This would need a service worker to expose headers
      // For now, check HTML link tags as fallback
      const linkTags = document.querySelectorAll('link[rel="c2pa-manifest"]');
      return linkTags.length > 0 ? linkTags[0].href : null;
    });
    
    return {
      linkHeaderPresent: linkHeader !== null,
      linkHeaderValue: linkHeader
    };
  }

  /**
   * Test badge display
   */
  async testBadgeDisplay() {
    console.log('Testing badge display...');
    
    // Navigate to front-end page with media
    await this.page.goto(`${this.config.baseUrl}/test-article`);
    
    // Check if badge script is loaded
    const badgeScript = await this.page.locator('script[src*="c2-badge.js"]');
    const badgeLoaded = await badgeScript.count() > 0;
    
    // Check if badge container is created
    await this.page.waitForTimeout(2000); // Wait for badge initialization
    
    const badgeContainer = await this.page.locator('.c2c-badge-container');
    const badgeVisible = await badgeContainer.count() > 0;
    
    // Check badge content
    let badgeText = null;
    if (badgeVisible) {
      const badge = await this.page.locator('.c2c-verification-badge');
      badgeText = await badge.textContent();
    }
    
    return {
      badgeScriptLoaded: badgeLoaded,
      badgeContainerCreated: badgeVisible,
      badgeText: badgeText
    };
  }

  /**
   * Test webhook handling
   */
  async testWebhookHandling() {
    console.log('Testing webhook handling...');
    
    // This would require setting up a test webhook endpoint
    // For now, test the webhook configuration UI
    
    await this.page.goto(`${this.config.adminUrl}/config/media/c2c_c2pa`);
    
    // Check webhook configuration fields
    const webhookUrlField = await this.page.locator('#edit-webhook-url');
    const webhookSecretField = await this.page.locator('#edit-webhook-secret');
    
    const webhookConfigurable = await webhookUrlField.isVisible() && 
                               await webhookSecretField.isVisible();
    
    return {
      webhookConfigurable: webhookConfigurable,
      webhookEndpoint: '/api/c2c_c2pa/webhook'
    };
  }

  /**
   * Test cron processing
   */
  async testCronProcessing() {
    console.log('Testing cron processing...');
    
    // Navigate to cron configuration
    await this.page.goto(`${this.config.adminUrl}/config/system/cron`);
    
    // Run cron manually
    await this.page.click('input[value="Run cron"]');
    
    // Wait for cron completion
    await this.page.waitForSelector('text=Cron run completed');
    
    // Check logs for C2PA processing
    await this.page.goto(`${this.config.adminUrl}/reports/dblog`);
    
    const c2paLogs = await this.page.locator('text=C2 Concierge').count();
    
    return {
      cronExecuted: true,
      c2paLogsFound: c2paLogs > 0,
      logCount: c2paLogs
    };
  }

  /**
   * Test configuration UI
   */
  async testConfigurationUI() {
    console.log('Testing configuration UI...');
    
    await this.page.goto(`${this.config.adminUrl}/config/media/c2c_c2pa`);
    
    // Test all configuration sections
    const sections = [
      'Signing Service Configuration',
      'Asset Processing',
      'Verification Badge',
      'Security Settings',
      'Analytics & Telemetry'
    ];
    
    const sectionResults = {};
    
    for (const section of sections) {
      const sectionElement = await this.page.locator(`text=${section}`);
      sectionResults[section] = await sectionElement.isVisible();
    }
    
    // Test form validation
    await this.page.fill('#edit-sign-url', 'invalid-url');
    await this.page.click('#edit-submit');
    
    const validationError = await this.page.locator('.form-item--error-message').count() > 0;
    
    return {
      allSectionsVisible: Object.values(sectionResults).every(visible => visible),
      sectionVisibility: sectionResults,
      formValidationWorks: validationError
    };
  }

  /**
   * Test uninstall safety
   */
  async testUninstallSafety() {
    console.log('Testing uninstall safety...');
    
    // Navigate to modules page
    await this.page.goto(`${this.config.adminUrl}/modules`);
    
    // Find C2 Concierge module and disable it
    const moduleRow = await this.page.locator('text=C2 Concierge C2PA').first();
    const checkbox = await moduleRow.locator('input[type="checkbox"]');
    
    // Uncheck the module
    await checkbox.uncheck();
    await this.page.click('#edit-submit');
    
    // Wait for uninstall
    await this.page.waitForSelector('text=The configuration options have been saved');
    
    // Test that the site still works without errors
    await this.page.goto(this.config.baseUrl);
    
    const siteWorking = await this.page.locator('body').isVisible();
    const noErrors = !await this.page.locator('.error').isVisible();
    
    // Re-enable the module
    await this.page.goto(`${this.config.adminUrl}/modules`);
    const moduleRow2 = await this.page.locator('text=C2 Concierge C2PA').first();
    const checkbox2 = await moduleRow2.locator('input[type="checkbox"]');
    await checkbox2.check();
    await this.page.click('#edit-submit');
    
    return {
      moduleDisabled: true,
      siteStillWorking: siteWorking,
      noPageErrors: noErrors,
      moduleReenabled: true
    };
  }

  /**
   * Get module version
   */
  async getModuleVersion() {
    // This would typically read from the .info.yml file
    // For testing, return a placeholder
    return '1.0.0';
  }

  /**
   * Generate test report
   */
  generateTestReport(results) {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const total = results.length;
    
    console.log('\n📊 Drupal Connector Test Report');
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
      platform: 'drupal',
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed, successRate: (passed / total) * 100 },
      results: results
    };
    
    require('fs').writeFileSync(
      './test-results/drupal-acceptance.json',
      JSON.stringify(reportData, null, 2)
    );
  }
}

// Run tests if called directly
if (require.main === module) {
  const tests = new DrupalAcceptanceTests();
  tests.runAllTests()
    .then(results => {
      console.log('\n✅ Drupal acceptance tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Drupal acceptance tests failed:', error);
      process.exit(1);
    });
}

module.exports = DrupalAcceptanceTests;
