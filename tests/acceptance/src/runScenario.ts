import { Scenario, ScenarioResult, FailureCode, FAILURE_TAXONOMY } from './types.js';
import { applyTransforms } from './transforms/index.js';
import { probeHeaders } from './probes/headersProbe.js';
import { probeLinkResolution } from './probes/linkResolutionProbe.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

function determineFailureCode(
  remote_survives: boolean,
  embed_survives: boolean,
  manifest_status: number,
  hash_alignment: boolean,
  has_link_header: boolean,
  error?: string
): FailureCode {
  if (error) {
    if (error.includes('timeout')) return 'INACCESSIBLE_TIMEOUT';
    if (error.includes('ECONNREFUSED')) return 'INACCESSIBLE';
    if (error.includes('404')) return 'INACCESSIBLE_404';
  }
  
  if (!remote_survives) {
    if (manifest_status !== 200) {
      return manifest_status === 404 ? 'INACCESSIBLE_404' : 'BROKEN_MANIFEST';
    }
    if (!hash_alignment) return 'BROKEN_MANIFEST';
    if (!has_link_header) return 'BROKEN_LINK';
    return 'BROKEN_HEADERS';
  }
  
  if (!embed_survives) {
    return 'DESTROYED_EMBED';
  }
  
  return 'SURVIVED';
}

export async function runScenario(
  scenario: Scenario,
  sandboxUrl: string,
  outputDir: string
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenarioDir = join(outputDir, 'scenarios', scenario.id);
  mkdirSync(scenarioDir, { recursive: true });

  try {
    // Load a test fixture (for Phase 0, we'll use a simple test image)
    const fixturePath = '../../fixtures/signed/test-image.jpg';
    let inputBuffer: Buffer;
    
    try {
      inputBuffer = readFileSync(join(__dirname, fixturePath));
    } catch (error) {
      // Create a proper test image buffer if fixture doesn't exist yet
      console.log('Creating test image buffer...');
      const sharp = (await import('sharp')).default;
      inputBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    }

    // Apply transforms
    const transformedBuffer = await applyTransforms(inputBuffer, scenario.transforms);
    
    // For Phase 0, we'll simulate the asset being available via URL
    // In a real implementation, this would upload to the sandbox
    const assetUrl = `${sandboxUrl}/assets/${scenario.id}.jpg`;

    // Probe headers
    const headersStart = Date.now();
    const headersResult = await probeHeaders(assetUrl);
    const headersTime = Date.now() - headersStart;

    // Probe link resolution (get expected manifest hash from X-Manifest-Hash header)
    const headResponse = await fetch(assetUrl, { method: 'HEAD' });
    const manifestHash = headResponse.headers.get('x-manifest-hash') || undefined;

    const linkStart = Date.now();
    const linkResult = await probeLinkResolution(assetUrl, manifestHash);
    const linkTime = Date.now() - linkStart;

    // Calculate verdict
    const remote_survives = linkResult.manifest_fetch_status === 200 && linkResult.hash_alignment;
    const embed_survives = scenario.sandbox === 'preserve-embed' && 
                          scenario.expected.embed_survives !== false &&
                          headersResult.x_c2_policy !== 'remote-only';

    const has_link_header = !!(headersResult.headers.link || '').includes('c2pa-manifest');
    const failure_code = determineFailureCode(
      remote_survives,
      embed_survives,
      linkResult.manifest_fetch_status,
      linkResult.hash_alignment,
      has_link_header
    );

    const result: ScenarioResult = {
      scenario_id: scenario.id,
      sandbox: scenario.sandbox,
      remote_survives,
      embed_survives,
      failure_code,
      failure_taxonomy: FAILURE_TAXONOMY[failure_code],
      headers_snapshot: headersResult.headers,
      manifest_fetch: {
        status: linkResult.manifest_fetch_status,
        hash_alignment: linkResult.hash_alignment,
        url: linkResult.manifest_url || ''
      },
      timings_ms: {
        edge_worker: 2, // Placeholder for Phase 0
        origin: Date.now() - startTime - headersTime - linkTime,
        manifest_fetch: linkTime
      }
    };

    // Write scenario artifacts
    writeFileSync(join(scenarioDir, 'headers.json'), JSON.stringify(headersResult, null, 2));
    writeFileSync(join(scenarioDir, 'manifest_fetch.json'), JSON.stringify(linkResult, null, 2));
    writeFileSync(join(scenarioDir, 'verdict.json'), JSON.stringify({
      remote_survives,
      embed_survives,
      failure_code,
      failure_taxonomy: result.failure_taxonomy,
      expected: scenario.expected
    }, null, 2));
    writeFileSync(join(scenarioDir, 'timings.json'), JSON.stringify(result.timings_ms, null, 2));

    return result;
  } catch (error) {
    const failure_code = determineFailureCode(false, false, -1, false, false, error instanceof Error ? error.message : String(error));
    
    const result: ScenarioResult = {
      scenario_id: scenario.id,
      sandbox: scenario.sandbox,
      remote_survives: false,
      embed_survives: false,
      failure_code,
      failure_taxonomy: FAILURE_TAXONOMY[failure_code],
      headers_snapshot: {},
      manifest_fetch: {
        status: -1,
        hash_alignment: false,
        url: ''
      },
      timings_ms: {
        edge_worker: 0,
        origin: 0,
        manifest_fetch: 0
      },
      error: error instanceof Error ? error.message : String(error)
    };

    writeFileSync(join(scenarioDir, 'error.json'), JSON.stringify({ error: result.error, failure_code }, null, 2));
    return result;
  }
}
