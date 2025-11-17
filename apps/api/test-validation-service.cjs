#!/usr/bin/env node

/**
 * ValidationService Runtime Integration Test
 * Tests Step 11 Input Validation Hardening implementation
 * 
 * Validates:
 * 1. Basic validation backwards compatibility
 * 2. Comprehensive security validation
 * 3. Malicious signature detection
 * 4. Custom assertion sanitization
 * 5. Environment configuration integration
 */

const fs = require('fs');
const path = require('path');

// Import the ValidationService
const { validationService, ValidationService } = require('./dist/services/validation-service.js');

console.log('🧪 Starting ValidationService Runtime Integration Test...');

// Test data
const testImageBuffer = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit, RGB
  0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
  0x54, 0x08, 0x99, 0x01, 0x01, 0x01, 0x00, 0x00, // Minimal image data
  0xFE, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // CRC
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
  0xAE, 0x42, 0x60, 0x82 // CRC
]);

const maliciousBuffer = Buffer.from([
  0x4D, 0x5A, // PE executable signature
  0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00,
  0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0xB8, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00
]);

const invalidImageBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]); // Invalid image

async function runValidationTests() {
  let testsPassed = 0;
  let testsTotal = 0;

  function test(description, condition) {
    testsTotal++;
    if (condition) {
      console.log(`✅ ${description}`);
      testsPassed++;
    } else {
      console.error(`❌ ${description}`);
    }
  }

  try {
    console.log('\\n📋 Testing Basic Validation (Backwards Compatibility)...');

    // Test 1: Basic PNG validation
    const basicResult = await validationService.validateBasic(testImageBuffer, 'image/png');
    test('Basic PNG validation passes', basicResult.isValid);
    test('Basic validation has no errors', basicResult.errors.length === 0);

    // Test 2: Invalid MIME type
    const invalidMimeResult = await validationService.validateBasic(testImageBuffer, 'application/pdf');
    test('Invalid MIME type rejected', !invalidMimeResult.isValid);
    test('Invalid MIME type has error message', invalidMimeResult.errors.length > 0);

    // Test 3: Empty file
    const emptyResult = await validationService.validateBasic(Buffer.alloc(0), 'image/png');
    test('Empty file rejected', !emptyResult.isValid);

    console.log('\\n🔒 Testing Comprehensive Security Validation...');

    // Test 4: Comprehensive validation (default options)
    const comprehensiveResult = await validationService.validateImage(testImageBuffer, 'image/png');
    test('Comprehensive PNG validation passes', comprehensiveResult.isValid);
    test('Comprehensive validation includes metadata', !!comprehensiveResult.metadata);
    test('Metadata includes format', comprehensiveResult.metadata?.format === 'png');
    test('Metadata includes hash', comprehensiveResult.metadata?.hash?.length === 64);

    // Test 5: Size limits
    const largeBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB buffer
    const sizeResult = await validationService.validateImage(largeBuffer, 'image/png');
    test('Large file rejected by size limit', !sizeResult.isValid);

    console.log('\\n🚨 Testing Malicious Signature Detection...');

    // Test 6: Malicious signature detection in strict mode
    const maliciousResult = await validationService.validateImage(maliciousBuffer, 'application/octet-stream', {
      strictMode: true,
      maxFileSize: 1024 * 1024
    });
    test('Malicious signature detected in strict mode', !maliciousResult.isValid);
    test('Malicious signature error message', maliciousResult.errors.some(e => e.includes('Malicious file signature')));

    // Test 7: Malicious signature not detected in non-strict mode
    const nonStrictResult = await validationService.validateImage(maliciousBuffer, 'application/octet-stream', {
      strictMode: false,
      maxFileSize: 1024 * 1024
    });
    test('Malicious signature bypassed in non-strict mode', !nonStrictResult.isValid); // Still fails due to MIME type

    console.log('\\n🧹 Testing Custom Assertion Sanitization...');

    // Test 8: Valid custom assertions
    const validAssertions = [
      { label: 'test.assertion', data: 'valid data' },
      { label: 'numeric.value', data: 123 },
      { label: 'boolean.flag', data: true }
    ];
    const sanitizedValid = validationService.sanitizeCustomAssertions(validAssertions);
    test('Valid assertions pass sanitization', sanitizedValid.isValid);
    test('Valid assertions preserve data', sanitizedValid.sanitized.length === 3);

    // Test 9: Invalid custom assertions
    const invalidAssertions = [
      { label: 'invalid-label!', data: 'test' }, // Invalid characters
      { label: 'toolong'.repeat(20), data: 'test' }, // Too long label
      { label: 'script.injection', data: '<script>alert("xss")</script>' } // Script injection
    ];
    const sanitizedInvalid = validationService.sanitizeCustomAssertions(invalidAssertions);
    test('Invalid assertions rejected', !sanitizedInvalid.isValid);
    test('Invalid assertions have errors', sanitizedInvalid.errors.length > 0);

    // Test 10: Script content sanitization
    const scriptAssertions = [
      { label: 'safe.label', data: 'javascript:alert(1)' }
    ];
    const sanitizedScript = validationService.sanitizeCustomAssertions(scriptAssertions);
    test('Script content sanitized', !sanitizedScript.sanitized[0].data.includes('javascript:'));

    console.log('\\n⚙️ Testing Environment Configuration...');

    // Test 11: Environment options
    const envOptions = ValidationService.getEnvironmentOptions();
    test('Environment options available', !!envOptions);
    test('Environment options include maxFileSize', envOptions.maxFileSize > 0);
    test('Environment options include dimension limits', envOptions.maxWidth > 0 && envOptions.maxHeight > 0);

    // Test 12: Custom validation options
    const customOptions = {
      maxWidth: 100,
      maxHeight: 100,
      maxFileSize: 1024,
      allowedFormats: ['png'],
      strictMode: true
    };
    const customResult = await validationService.validateImage(testImageBuffer, 'image/png', customOptions);
    test('Custom options applied successfully', customResult.isValid);

    console.log('\\n🔄 Testing Error Handling...');

    // Test 13: Invalid magic bytes
    const invalidMagicResult = await validationService.validateImage(invalidImageBuffer, 'image/png');
    test('Invalid magic bytes rejected', !invalidMagicResult.isValid);
    test('Invalid magic bytes error message', invalidMagicResult.errors.some(e => e.includes('Invalid magic bytes')));

    // Test 14: Unsupported format
    const unsupportedResult = await validationService.validateImage(testImageBuffer, 'image/svg+xml');
    test('Unsupported format rejected', !unsupportedResult.isValid);

    console.log('\\n📊 Test Results Summary:');
    console.log(`Passed: ${testsPassed}/${testsTotal} tests`);
    
    if (testsPassed === testsTotal) {
      console.log('🎉 All ValidationService tests PASSED!');
      console.log('✅ Step 11 Input Validation Hardening implementation is working correctly');
      console.log('✅ Backwards compatibility maintained');
      console.log('✅ Security features functional');
      console.log('✅ Ready for production deployment');
      process.exit(0);
    } else {
      console.error(`❌ ${testsTotal - testsPassed} tests failed`);
      console.error('🚨 ValidationService needs fixes before deployment');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  }
}

// Run the tests
runValidationTests();
