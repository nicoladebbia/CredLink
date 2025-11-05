/**
 * WordPress Theme Survival Matrix Testing
 * Tests C2 Concierge injection across multiple WordPress themes
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { createObjectCsvWriter } from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  theme: string;
  scenario: string;
  link_in_head: boolean;
  badge_in_dom: boolean;
  data_attributes: boolean;
  uninstall_clean: boolean;
  status: 'PASS' | 'FAIL';
  errors: string[];
  artifacts: string[];
}

interface ThemeConfig {
  name: string;
  slug: string;
  scenarios: string[];
}

class WordPressThemeTester {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private wp_url: string;
  private wp_username: string;
  private wp_password: string;
  private results: TestResult[] = [];
  private artifacts_dir: string;

  constructor(config: any) {
    this.wp_url = config.wp_url || 'http://localhost:8080';
    this.wp_username = config.wp_username || 'admin';
    this.wp_password = config.wp_password || 'password';
    this.artifacts_dir = config.artifacts_dir || '.artifacts/cms/wp';
    
    // Ensure artifacts directory exists
    if (!fs.existsSync(this.artifacts_dir)) {
      fs.mkdirSync(this.artifacts_dir, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'C2Concierge-Test/1.0'
    });
  }

  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Run theme survival matrix tests
   */
  async runThemeMatrix(): Promise<TestResult[]> {
    const themes: ThemeConfig[] = [
      { name: 'Twenty Twenty-Five', slug: 'twentytwentyfive', scenarios: ['single', 'gallery', 'hero'] },
      { name: 'Twenty Twenty-Four', slug: 'twentytwentyfour', scenarios: ['single', 'gallery', 'hero'] },
      { name: 'Astra', slug: 'astra', scenarios: ['single', 'gallery', 'hero'] },
      { name: 'GeneratePress', slug: 'generatepress', scenarios: ['single', 'gallery', 'hero'] },
      { name: 'Hello Elementor', slug: 'hello-elementor', scenarios: ['single', 'gallery', 'hero'] }
    ];

    for (const theme of themes) {
      console.log(`Testing theme: ${theme.name}`);
      
      for (const scenario of theme.scenarios) {
        const result = await this.testThemeScenario(theme, scenario);
        this.results.push(result);
        
        // Save artifacts
        await this.saveArtifacts(theme, scenario, result);
      }
    }

    return this.results;
  }

  /**
   * Test individual theme scenario
   */
  private async testThemeScenario(theme: ThemeConfig, scenario: string): Promise<TestResult> {
    const page = await this.context!.newPage();
    const result: TestResult = {
      theme: theme.name,
      scenario,
      link_in_head: false,
      badge_in_dom: false,
      data_attributes: false,
      uninstall_clean: false,
      status: 'FAIL',
      errors: [],
      artifacts: []
    };

    try {
      // 1. Install and activate theme
      await this.installTheme(page, theme.slug);
      
      // 2. Install and activate C2 Concierge plugin
      await this.installPlugin(page);
      
      // 3. Create test content based on scenario
      const post_id = await this.createTestContent(page, scenario);
      
      // 4. Upload test image
      const image_id = await this.uploadTestImage(page);
      
      // 5. Attach image to post
      await this.attachImageToPost(page, post_id, image_id);
      
      // 6. Visit post page and check injection
      await this.checkPageInjection(page, post_id, result);
      
      // 7. Test uninstall safety
      await this.testUninstallSafety(page, result, post_id);
      
      // Determine final status
      result.status = this.determineTestStatus(result);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Test execution error: ${errorMessage}`);
      console.error(`Error testing ${theme.name} - ${scenario}:`, error);
    } finally {
      await page.close();
    }

    return result;
  }

  /**
   * Install WordPress theme
   */
  private async installTheme(page: Page, theme_slug: string): Promise<void> {
    await page.goto(`${this.wp_url}/wp-admin/themes.php`);
    
    // Check if theme is already installed
    const theme_installed = await page.locator(`.theme[data-slug="${theme_slug}"]`).isVisible();
    
    if (!theme_installed) {
      // Install theme
      await page.click('[data-overview-tab="install"]');
      await page.fill('#theme-search-input', theme_slug);
      await page.keyboard.press('Enter');
      await page.waitForSelector(`.theme[data-slug="${theme_slug}"]`);
      await page.click(`.theme[data-slug="${theme_slug}"] .install-theme-preview`);
      await page.click('.theme-install');
      await page.waitForSelector('.theme-install.success');
    }
    
    // Activate theme
    await page.goto(`${this.wp_url}/wp-admin/themes.php`);
    await page.click(`.theme[data-slug="${theme_slug}"] .activate`);
    await page.waitForSelector('.theme.active[data-slug="${theme_slug}"]');
  }

  /**
   * Install C2 Concierge plugin
   */
  private async installPlugin(page: Page): Promise<void> {
    await page.goto(`${this.wp_url}/wp-admin/plugins.php`);
    
    // Check if plugin is already installed
    const plugin_installed = await page.locator('#plugin-c2concierge').isVisible();
    
    if (!plugin_installed) {
      // Upload plugin
      await page.click('#plugin-install');
      await page.click('[href="upload"]');
      await page.setInputFiles('#pluginzip', 'plugins/wp-c2concierge.zip');
      await page.click('.install-now');
      await page.waitForSelector('.button.activate-now');
      await page.click('.activate-now');
    } else {
      // Activate if not active
      const activate_button = page.locator('#plugin-c2concierge .activate-now');
      if (await activate_button.isVisible()) {
        await activate_button.click();
      }
    }
    
    await page.waitForSelector('#plugin-c2concierge.active');
  }

  /**
   * Create test content based on scenario
   */
  private async createTestContent(page: Page, scenario: string): Promise<number> {
    await page.goto(`${this.wp_url}/wp-admin/post-new.php`);
    
    const title = `C2 Test - ${scenario} - ${Date.now()}`;
    await page.fill('#title', title);
    
    let content = '';
    
    switch (scenario) {
      case 'single':
        content = '<!-- wp:paragraph --><p>Test single image scenario.</p><!-- /wp:paragraph -->';
        break;
      case 'gallery':
        content = '<!-- wp:gallery {"ids":[]} --><ul class="wp-block-gallery columns-3 is-cropped"><!-- /wp:gallery -->';
        break;
      case 'hero':
        content = '<!-- wp:cover {"url":"false","overlayColor":"primary"} --><div class="wp-block-cover"><div class="wp-block-cover__inner-container"><!-- wp:paragraph {"align":"center","fontSize":"large"} --><p class="has-text-align-center has-large-font-size">Hero content</p><!-- /wp:paragraph --></div></div><!-- /wp:cover -->';
        break;
    }
    
    await page.fill('#content', content);
    await page.click('#publish');
    await page.waitForSelector('.notice-success');
    
    // Get post ID from URL
    const url = page.url();
    const post_id_match = url.match(/post=(\d+)/);
    return post_id_match ? parseInt(post_id_match[1]) : 0;
  }

  /**
   * Upload test image
   */
  private async uploadTestImage(page: Page): Promise<number> {
    await page.goto(`${this.wp_url}/wp-admin/media-new.php`);
    
    // Create a test image
    const test_image_path = await this.createTestImage();
    
    await page.setInputFiles('#async-upload', test_image_path);
    await page.click('#html-upload');
    await page.waitForSelector('.attachment-save-ready');
    
    // Get attachment ID
    const attachment_id = await page.locator('.attachment-info').getAttribute('data-attachment-id');
    return attachment_id ? parseInt(attachment_id) : 0;
  }

  /**
   * Create test image for upload
   */
  private async createTestImage(): Promise<string> {
    const sharp = (await import('sharp')).default;
    const image_path = path.join(process.cwd(), 'test-image.jpg');
    
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
    .jpeg({ quality: 90 })
    .toFile(image_path);
    
    return image_path;
  }

  /**
   * Attach image to post
   */
  private async attachImageToPost(page: Page, post_id: number, image_id: number): Promise<void> {
    await page.goto(`${this.wp_url}/wp-admin/post.php?post=${post_id}&action=edit`);
    
    // Add featured image
    await page.click('#set-post-thumbnail');
    await page.waitForSelector('.media-frame');
    await page.click(`.attachment[data-id="${image_id}"]`);
    await page.click('.media-button-select');
    await page.waitForSelector('#set-post-thumbnail .has-post-thumbnail');
    
    // Update post
    await page.click('#publish');
    await page.waitForSelector('.notice-success');
  }

  /**
   * Check page injection
   */
  private async checkPageInjection(page: Page, post_id: number, result: TestResult): Promise<void> {
    // Visit the post
    await page.goto(`${this.wp_url}/?p=${post_id}`);
    
    // Check for manifest link in head
    const manifest_links = await page.locator('head link[rel="c2pa-manifest"]').count();
    result.link_in_head = manifest_links > 0;
    
    // Check for C2 badges in DOM
    const c2_badges = await page.locator('c2-badge').count();
    result.badge_in_dom = c2_badges > 0;
    
    // Check for data attributes on images
    const images_with_data = await page.locator('img[data-c2pa-manifest]').count();
    result.data_attributes = images_with_data > 0;
    
    // Take screenshot for artifact
    const screenshot_path = path.join(this.artifacts_dir, `${result.theme}-${result.scenario}-injection.png`);
    await page.screenshot({ path: screenshot_path, fullPage: true });
    result.artifacts.push(screenshot_path);
    
    // Save HTML content
    const html_content = await page.content();
    const html_path = path.join(this.artifacts_dir, `${result.theme}-${result.scenario}.html`);
    fs.writeFileSync(html_path, html_content);
    result.artifacts.push(html_path);
  }

  /**
   * Test uninstall safety
   */
  private async testUninstallSafety(page: Page, result: TestResult, post_id: number): Promise<void> {
    // Deactivate and delete plugin
    await page.goto(`${this.wp_url}/wp-admin/plugins.php`);
    await page.click('#plugin-c2concierge .deactivate');
    await page.waitForSelector('#plugin-c2concierge:not(.active)');
    await page.click('#plugin-c2concierge .delete');
    await page.click('.button-primary'); // Confirm deletion
    await page.waitForSelector('#message');
    
    // Visit post again to check if it still renders
    await page.goto(`${this.wp_url}/?p=${post_id}`);
    
    // Check if page loads without errors
    const page_title = await page.title();
    const has_content = await page.locator('.entry-content, .post-content').isVisible();
    
    result.uninstall_clean = page_title !== '' && has_content;
    
    // Take screenshot after uninstall
    const screenshot_path = path.join(this.artifacts_dir, `${result.theme}-${result.scenario}-uninstall.png`);
    await page.screenshot({ path: screenshot_path, fullPage: true });
    result.artifacts.push(screenshot_path);
  }

  /**
   * Determine test status based on results
   */
  private determineTestStatus(result: TestResult): 'PASS' | 'FAIL' {
    const required_checks = [
      result.link_in_head,
      result.badge_in_dom,
      result.data_attributes,
      result.uninstall_clean
    ];
    
    return required_checks.every(check => check) ? 'PASS' : 'FAIL';
  }

  /**
   * Save test artifacts
   */
  private async saveArtifacts(theme: ThemeConfig, scenario: string, result: TestResult): Promise<void> {
    const artifact_data = {
      theme: theme.name,
      scenario,
      timestamp: new Date().toISOString(),
      results: {
        link_in_head: result.link_in_head,
        badge_in_dom: result.badge_in_dom,
        data_attributes: result.data_attributes,
        uninstall_clean: result.uninstall_clean,
        status: result.status
      },
      errors: result.errors,
      artifacts: result.artifacts
    };
    
    const json_path = path.join(this.artifacts_dir, `${theme.name}-${scenario}.json`);
    fs.writeFileSync(json_path, JSON.stringify(artifact_data, null, 2));
  }

  /**
   * Generate CSV report
   */
  async generateReport(): Promise<void> {
    const csv_path = path.join(this.artifacts_dir, 'theme-matrix-results.csv');
    
    const csvWriter = createObjectCsvWriter({
      path: csv_path,
      header: [
        { id: 'theme', title: 'Theme' },
        { id: 'scenario', title: 'Scenario' },
        { id: 'link_in_head', title: 'Link in Head' },
        { id: 'badge_in_dom', title: 'Badge in DOM' },
        { id: 'data_attributes', title: 'Data Attributes' },
        { id: 'uninstall_clean', title: 'Uninstall Clean' },
        { id: 'status', title: 'Status' },
        { id: 'errors', title: 'Errors' }
      ]
    });
    
    await csvWriter.writeRecords(this.results);
    console.log(`Report saved to: ${csv_path}`);
  }

  /**
   * Generate HTML matrix view
   */
  async generateMatrixHtml(): Promise<void> {
    const html_path = path.join(this.artifacts_dir, 'matrix.html');
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>C2 Concierge WordPress Theme Matrix</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .matrix { border-collapse: collapse; width: 100%; }
        .matrix th, .matrix td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .matrix th { background-color: #f2f2f2; }
        .pass { background-color: #d4edda; color: #155724; }
        .fail { background-color: #f8d7da; color: #721c24; }
        .summary { margin-bottom: 20px; padding: 15px; background-color: #e9ecef; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>C2 Concierge WordPress Theme Survival Matrix</h1>
    
    <div class="summary">
        <h2>Summary</h2>
        <p>Total Tests: ${this.results.length}</p>
        <p>Passed: ${this.results.filter(r => r.status === 'PASS').length}</p>
        <p>Failed: ${this.results.filter(r => r.status === 'FAIL').length}</p>
        <p>Success Rate: ${((this.results.filter(r => r.status === 'PASS').length / this.results.length) * 100).toFixed(1)}%</p>
    </div>
    
    <table class="matrix">
        <thead>
            <tr>
                <th>Theme</th>
                <th>Scenario</th>
                <th>Link in Head</th>
                <th>Badge in DOM</th>
                <th>Data Attributes</th>
                <th>Uninstall Clean</th>
                <th>Status</th>
                <th>Errors</th>
            </tr>
        </thead>
        <tbody>
            ${this.results.map(result => `
                <tr class="${result.status.toLowerCase()}">
                    <td>${result.theme}</td>
                    <td>${result.scenario}</td>
                    <td>${result.link_in_head ? '✓' : '✗'}</td>
                    <td>${result.badge_in_dom ? '✓' : '✗'}</td>
                    <td>${result.data_attributes ? '✓' : '✗'}</td>
                    <td>${result.uninstall_clean ? '✓' : '✗'}</td>
                    <td><strong>${result.status}</strong></td>
                    <td>${result.errors.join('; ')}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>`;
    
    fs.writeFileSync(html_path, html);
    console.log(`Matrix HTML saved to: ${html_path}`);
  }
}

// Main execution
async function main() {
  const config = {
    wp_url: process.env.WP_URL || 'http://localhost:8080',
    wp_username: process.env.WP_USERNAME || 'admin',
    wp_password: process.env.WP_PASSWORD || 'password',
    artifacts_dir: '.artifacts/cms/wp'
  };

  const tester = new WordPressThemeTester(config);
  
  try {
    await tester.initialize();
    const results = await tester.runThemeMatrix();
    await tester.generateReport();
    await tester.generateMatrixHtml();
    
    console.log('WordPress theme matrix testing completed');
    console.log(`Results: ${results.filter(r => r.status === 'PASS').length}/${results.length} passed`);
    
  } catch (error) {
    console.error('Testing failed:', error);
    process.exit(1);
  } finally {
    await tester.cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export async function runWordPressTests() {
  await main();
}
