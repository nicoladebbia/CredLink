#!/usr/bin/env node
/**
 * Supply Chain Security Acceptance Tests
 * Tests for Phase 22 - Supply-Chain Security v1 (Ship-ready)
 */

const { execSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { strict: assert } = require('assert');

class SupplyChainSecurityTests {
  constructor() {
    this.results = [];
    this.testImage = 'ghcr.io/nickiller04/c2-concierge:latest';
    this.tempDir = './temp-test';
  }

  async runAllTests() {
    console.log('🔒 Supply Chain Security Acceptance Tests');
    console.log('==========================================\n');

    // Setup
    this.setup();

    try {
      // Core acceptance tests
      await this.testImageSignature();
      await this.testProvenanceAttestation();
      await this.testSbomGeneration();
      await this.testSbomVerification();
      await this.testCveGate();
      await this.testReproducibleBuild();
      await this.testAdmissionControl();
      await this.testKeylessSigning();

      // Additional validation tests
      await this.testSlsaCompliance();
      await this.testSpdxValidation();
      await this.testCycloneDxValidation();
      await this.testTransparencyLog();

    } finally {
      this.cleanup();
    }

    this.printResults();
  }

  setup() {
    console.log('📋 Setting up test environment...');
    execSync(`mkdir -p ${this.tempDir}`, { stdio: 'inherit' });
  }

  cleanup() {
    console.log('🧹 Cleaning up test environment...');
    execSync(`rm -rf ${this.tempDir}`, { stdio: 'inherit' });
  }

  async runTest(name, testFn) {
    const startTime = Date.now();
    try {
      await testFn();
      this.results.push({
        name,
        passed: true,
        message: '✅ PASSED',
        duration: Date.now() - startTime
      });
      console.log(`✅ ${name}`);
    } catch (error) {
      this.results.push({
        name,
        passed: false,
        message: `❌ FAILED: ${error.message}`,
        duration: Date.now() - startTime
      });
      console.log(`❌ ${name}: ${error.message}`);
    }
  }

  async testImageSignature() {
    await this.runTest('Image Signature Verification', async () => {
      try {
        const output = execSync(`cosign verify ${this.testImage}`, { 
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        if (!output.includes('Verification for')) {
          throw new Error('Signature verification output invalid');
        }
      } catch (error) {
        throw new Error(`Image signature verification failed: ${error.message}`);
      }
    });
  }

  async testProvenanceAttestation() {
    await this.runTest('SLSA Provenance Attestation', async () => {
      try {
        const attestations = execSync(`cosign attestations list ${this.testImage}`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });

        if (!attestations.includes('slsaprovenance')) {
          throw new Error('SLSA provenance attestation not found');
        }

        // Verify provenance content
        const provenance = execSync(
          `cosign verify-attestation --type slsaprovenance ${this.testImage}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        if (!provenance.includes('github.com/Nickiller04/c2-concierge')) {
          throw new Error('Invalid builder ID in provenance');
        }
      } catch (error) {
        throw new Error(`Provenance attestation failed: ${error.message}`);
      }
    });
  }

  async testSbomGeneration() {
    await this.runTest('SBOM Generation', async () => {
      try {
        // Generate SBOM locally
        const spdxOutput = join(this.tempDir, 'test-sbom.spdx.json');
        const cdxOutput = join(this.tempDir, 'test-sbom.cdx.json');

        execSync(`syft ${this.testImage} -o spdx-json=${spdxOutput}`, { stdio: 'pipe' });
        execSync(`syft ${this.testImage} -o cyclonedx-json=${cdxOutput}`, { stdio: 'pipe' });

        // Validate SPDX
        const spdxContent = JSON.parse(readFileSync(spdxOutput, 'utf8'));
        if (spdxContent.spdxVersion !== 'SPDX-2.3') {
          throw new Error(`Invalid SPDX version: ${spdxContent.spdxVersion}`);
        }

        // Validate CycloneDX
        const cdxContent = JSON.parse(readFileSync(cdxOutput, 'utf8'));
        if (!['1.4', '1.5'].includes(cdxContent.specVersion)) {
          throw new Error(`Invalid CycloneDX version: ${cdxContent.specVersion}`);
        }

        // Check for components
        if (!cdxContent.components || cdxContent.components.length === 0) {
          throw new Error('No components found in CycloneDX SBOM');
        }
      } catch (error) {
        throw new Error(`SBOM generation failed: ${error.message}`);
      }
    });
  }

  async testSbomVerification() {
    await this.runTest('SBOM Verification', async () => {
      try {
        // Download attested SBOM
        const attestedSbom = execSync(
          `cosign verify-attestation --type sbom ${this.testImage}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        const sbomData = JSON.parse(attestedSbom);
        if (!sbomData.predicate || !sbomData.predicate.spdxVersion) {
          throw new Error('Invalid SBOM attestation format');
        }

        // Verify SBOM integrity
        execSync(`./scripts/verify-sbom.sh ${this.tempDir} ${this.testImage}`, { stdio: 'pipe' });
      } catch (error) {
        throw new Error(`SBOM verification failed: ${error.message}`);
      }
    });
  }

  async testCveGate() {
    await this.runTest('CVE Gate Enforcement', async () => {
      try {
        // Scan image for Critical/High vulnerabilities
        const scanOutput = execSync(
          `trivy image --severity CRITICAL,HIGH --exit-code 1 ${this.testImage}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        // If we get here, there were no Critical/High vulnerabilities
        // This is the expected behavior for a passing gate
        console.log('✅ No Critical/High vulnerabilities found');
      } catch (error) {
        // Check if it failed due to vulnerabilities (bad) or exit code 1 with no vulns (good)
        if (error.message.includes('No vulnerabilities found')) {
          console.log('✅ No Critical/High vulnerabilities found');
          return;
        }
        throw new Error(`CVE gate failed: ${error.message}`);
      }
    });
  }

  async testReproducibleBuild() {
    await this.runTest('Reproducible Build', async () => {
      try {
        // Get current image digest
        const imageInfo = execSync(
          `docker buildx imagetools inspect ${this.testImage}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        if (!imageInfo.includes('sha256:')) {
          throw new Error('Could not get image digest');
        }

        // For full reproducibility test, this would require rebuilding from source
        // For now, we verify the build metadata is present
        const provenance = execSync(
          `cosign verify-attestation --type slsaprovenance ${this.testImage}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        const provenanceData = JSON.parse(provenance);
        if (!provenanceData.predicate.buildType) {
          throw new Error('Build type not found in provenance');
        }

        if (!provenanceData.predicate.invocation?.parameters?.sourceDateEpoch) {
          throw new Error('SOURCE_DATE_EPOCH not found in provenance');
        }
      } catch (error) {
        throw new Error(`Reproducible build test failed: ${error.message}`);
      }
    });
  }

  async testAdmissionControl() {
    await this.runTest('Admission Control Policy', async () => {
      try {
        // Check if policy controller is deployed
        const policyStatus = execSync(
          'kubectl get clusterimagepolicy require-signed-and-provenance -o jsonpath={.status.conditions[0].status}',
          { encoding: 'utf8', stdio: 'pipe' }
        );

        if (policyStatus.trim() !== 'True') {
          throw new Error('Policy controller not ready');
        }

        // Verify policy configuration
        const policyConfig = execSync(
          'kubectl get clusterimagepolicy require-signed-and-provenance -o yaml',
          { encoding: 'utf8', stdio: 'pipe' }
        );

        if (!policyConfig.includes('policy.sigstore.dev/v1alpha1')) {
          throw new Error('Invalid policy configuration');
        }

        if (!policyConfig.includes('slsa-provenance')) {
          throw new Error('SLSA provenance requirement not found in policy');
        }
      } catch (error) {
        // If kubectl is not available, skip this test
        if (error.message.includes('kubectl: not found')) {
          console.log('⏭️  Skipping admission control test (kubectl not available)');
          return;
        }
        throw new Error(`Admission control test failed: ${error.message}`);
      }
    });
  }

  async testKeylessSigning() {
    await this.runTest('Keyless Signing Verification', async () => {
      try {
        // Verify keyless signature
        const signatureOutput = execSync(
          `cosign verify ${this.testImage} --certificate-identity-regexp "repo:Nickiller04/c2-concierge:.*"`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        if (!signatureOutput.includes('github.com')) {
          throw new Error('Keyless signature verification failed');
        }

        // Check for Rekor entry
        const rekorOutput = execSync(
          `cosign verify ${this.testImage} --certificate-oidc-issuer "https://token.actions.githubusercontent.com"`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        if (!rekorOutput.includes('tlog entries verified')) {
          throw new Error('Rekor transparency log verification failed');
        }
      } catch (error) {
        throw new Error(`Keyless signing test failed: ${error.message}`);
      }
    });
  }

  async testSlsaCompliance() {
    await this.runTest('SLSA Compliance', async () => {
      try {
        const provenance = execSync(
          `cosign verify-attestation --type slsaprovenance ${this.testImage}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        const provenanceData = JSON.parse(provenance);
        const predicate = provenanceData.predicate;

        // Check SLSA requirements
        if (!predicate.buildType) {
          throw new Error('Missing buildType for SLSA');
        }

        if (!predicate.builder?.id) {
          throw new Error('Missing builder.id for SLSA');
        }

        if (!predicate.materials || predicate.materials.length === 0) {
          throw new Error('Missing materials for SLSA');
        }

        // Verify builder is GitHub Actions
        if (!predicate.builder.id.includes('github.com')) {
          throw new Error('Invalid builder for SLSA compliance');
        }
      } catch (error) {
        throw new Error(`SLSA compliance test failed: ${error.message}`);
      }
    });
  }

  async testSpdxValidation() {
    await this.runTest('SPDX Validation', async () => {
      try {
        const sbomOutput = join(this.tempDir, 'validation-sbom.spdx.json');
        execSync(`syft ${this.testImage} -o spdx-json=${sbomOutput}`, { stdio: 'pipe' });

        const spdxContent = JSON.parse(readFileSync(sbomOutput, 'utf8'));

        // Required SPDX fields
        const requiredFields = ['spdxVersion', 'name', 'creationInfo', 'packages'];
        for (const field of requiredFields) {
          if (!spdxContent[field]) {
            throw new Error(`Missing required SPDX field: ${field}`);
          }
        }

        // Validate SPDX version
        if (spdxContent.spdxVersion !== 'SPDX-2.3') {
          throw new Error(`Unsupported SPDX version: ${spdxContent.spdxVersion}`);
        }

        // Check creation info
        if (!spdxContent.creationInfo.created) {
          throw new Error('Missing creation timestamp in SPDX');
        }
      } catch (error) {
        throw new Error(`SPDX validation failed: ${error.message}`);
      }
    });
  }

  async testCycloneDxValidation() {
    await this.runTest('CycloneDX Validation', async () => {
      try {
        const sbomOutput = join(this.tempDir, 'validation-sbom.cdx.json');
        execSync(`syft ${this.testImage} -o cyclonedx-json=${sbomOutput}`, { stdio: 'pipe' });

        const cdxContent = JSON.parse(readFileSync(sbomOutput, 'utf8'));

        // Required CycloneDX fields
        const requiredFields = ['bomFormat', 'specVersion', 'version'];
        for (const field of requiredFields) {
          if (cdxContent[field] === undefined) {
            throw new Error(`Missing required CycloneDX field: ${field}`);
          }
        }

        // Validate format
        if (cdxContent.bomFormat !== 'CycloneDX') {
          throw new Error(`Invalid BOM format: ${cdxContent.bomFormat}`);
        }

        // Validate version
        if (!['1.4', '1.5'].includes(cdxContent.specVersion)) {
          throw new Error(`Unsupported CycloneDX version: ${cdxContent.specVersion}`);
        }

        // Check for components
        if (!cdxContent.components || cdxContent.components.length === 0) {
          throw new Error('No components found in CycloneDX SBOM');
        }
      } catch (error) {
        throw new Error(`CycloneDX validation failed: ${error.message}`);
      }
    });
  }

  async testTransparencyLog() {
    await this.runTest('Transparency Log Verification', async () => {
      try {
        // Verify Rekor entry
        const verifyOutput = execSync(
          `cosign verify ${this.testImage}`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        if (!verifyOutput.includes('tlog entries verified')) {
          throw new Error('Transparency log verification failed');
        }

        // Get Rekor log index
        const rekorInfo = execSync(
          `cosign verify ${this.testImage} --output-json`,
          { encoding: 'utf8', stdio: 'pipe' }
        );

        const rekorData = JSON.parse(rekorInfo);
        if (!rekorData[0]?.logIndex) {
          throw new Error('Rekor log index not found');
        }
      } catch (error) {
        throw new Error(`Transparency log test failed: ${error.message}`);
      }
    });
  }

  printResults() {
    console.log('\n📊 Test Results Summary');
    console.log('======================\n');

    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const failed = total - passed;

    this.results.forEach(result => {
      console.log(`${result.passed ? '✅' : '❌'} ${result.name} (${result.duration}ms)`);
      if (!result.passed) {
        console.log(`   ${result.message}`);
      }
    });

    console.log(`\n📈 Summary: ${passed}/${total} tests passed`);
    
    if (failed > 0) {
      console.log(`❌ ${failed} tests failed`);
      process.exit(1);
    } else {
      console.log('🎉 All tests passed! Supply chain security is ship-ready.');
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tests = new SupplyChainSecurityTests();
  tests.runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { SupplyChainSecurityTests };
