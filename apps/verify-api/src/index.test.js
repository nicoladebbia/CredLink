/**
 * Verify API Tests
 * Node.js native test runner for the verification service
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createServer } from './index.js';
import { verifyProvenance } from './verification.js';
describe('Verify API Service', () => {
    let server;
    test('should create server successfully', async () => {
        server = await createServer();
        assert.ok(server, 'Server should be created');
        assert.equal(typeof server.listen, 'function', 'Server should have listen method');
    });
    test('should handle health check endpoint', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });
        assert.equal(response.statusCode, 200, 'Health check should return 200');
        const body = JSON.parse(response.body);
        assert.equal(body.success, true, 'Response should be successful');
        assert.ok(body.data, 'Response should have data');
        assert.equal(body.data.status, 'healthy', 'Status should be healthy');
        assert.ok(body.request_id, 'Response should have request ID');
        assert.ok(body.timestamp, 'Response should have timestamp');
    });
    test('should handle trust roots endpoint', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/trust-roots'
        });
        assert.equal(response.statusCode, 200, 'Trust roots should return 200');
        const body = JSON.parse(response.body);
        assert.equal(body.success, true, 'Response should be successful');
        assert.ok(body.data, 'Response should have data');
        assert.ok(Array.isArray(body.data.trust_roots), 'Trust roots should be an array');
        assert.ok(body.data.trust_roots.length > 0, 'Should have at least one trust root');
    });
    test('should handle metrics endpoint', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/metrics'
        });
        assert.equal(response.statusCode, 200, 'Metrics should return 200');
        const body = JSON.parse(response.body);
        assert.equal(body.success, true, 'Response should be successful');
        assert.ok(body.data, 'Response should have data');
        assert.equal(typeof body.data.total_verifications, 'number', 'Total verifications should be a number');
        assert.equal(typeof body.data.success_rate, 'number', 'Success rate should be a number');
        assert.equal(typeof body.data.average_response_time_ms, 'number', 'Average response time should be a number');
    });
    test('should reject invalid verification requests', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/verify',
            headers: { 'Content-Type': 'application/json' },
            body: {}
        });
        assert.equal(response.statusCode, 400, 'Invalid request should return 400');
        const body = JSON.parse(response.body);
        assert.equal(body.success, false, 'Response should not be successful');
        assert.ok(body.error, 'Response should have error');
    });
    test('should handle verification with asset URL', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/verify',
            headers: { 'Content-Type': 'application/json' },
            body: {
                asset_url: 'https://picsum.photos/seed/test/300/200.jpg'
            }
        });
        assert.equal(response.statusCode, 200, 'Verification should return 200');
        const body = JSON.parse(response.body);
        assert.equal(body.success, true, 'Response should be successful');
        assert.ok(body.data, 'Response should have data');
        assert.equal(typeof body.data.valid, 'boolean', 'Valid should be a boolean');
        assert.ok(body.data.signer, 'Response should have signer info');
        assert.ok(body.data.assertions, 'Response should have assertions');
        assert.ok(body.data.decision_path, 'Response should have decision path');
        assert.ok(body.data.metrics, 'Response should have metrics');
    });
    test('should handle verification with manifest URL', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/verify',
            headers: { 'Content-Type': 'application/json' },
            body: {
                manifest_url: 'https://example.com/manifest.c2pa'
            }
        });
        assert.equal(response.statusCode, 200, 'Verification should return 200');
        const body = JSON.parse(response.body);
        assert.equal(body.success, true, 'Response should be successful');
        assert.ok(body.data, 'Response should have data');
        assert.equal(body.data.decision_path.discovery, 'direct_url', 'Should use direct URL discovery');
    });
    test('should handle 404 for unknown routes', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/unknown'
        });
        assert.equal(response.statusCode, 404, 'Unknown route should return 404');
        const body = JSON.parse(response.body);
        assert.equal(body.success, false, 'Response should not be successful');
        assert.ok(body.error, 'Response should have error');
        assert.equal(body.error.code, 'NOT_FOUND', 'Error code should be NOT_FOUND');
    });
    test('should handle OPTIONS for CORS', async () => {
        const response = await server.inject({
            method: 'OPTIONS',
            url: '/health'
        });
        assert.equal(response.statusCode, 204, 'OPTIONS should return 204');
        assert.ok(response.headers['access-control-allow-origin'], 'Should have CORS headers');
        assert.ok(response.headers['access-control-allow-methods'], 'Should have methods header');
    });
});
describe('Verification Service', () => {
    test('should validate URLs correctly', async () => {
        // Test with invalid URL (this will fail gracefully)
        const result = await verifyProvenance({
            asset_url: 'invalid-url'
        });
        assert.ok(result, 'Should return result object');
        assert.equal(result.valid, false, 'Invalid URL should not be valid');
        assert.ok(result.warnings.length > 0, 'Should have warnings');
    });
    test('should handle missing URLs gracefully', async () => {
        const result = await verifyProvenance({});
        assert.ok(result, 'Should return result object');
        assert.equal(result.valid, false, 'Missing URL should not be valid');
        assert.ok(result.warnings.length > 0, 'Should have warnings');
    });
    test('should include metrics in response', async () => {
        const result = await verifyProvenance({
            asset_url: 'https://picsum.photos/seed/metrics/300/200.jpg'
        });
        assert.ok(result.metrics, 'Should have metrics');
        assert.equal(typeof result.metrics.total_time_ms, 'number', 'Total time should be a number');
        assert.equal(typeof result.metrics.fetch_time_ms, 'number', 'Fetch time should be a number');
        assert.equal(typeof result.metrics.validation_time_ms, 'number', 'Validation time should be a number');
        assert.equal(typeof result.metrics.cached, 'boolean', 'Cached should be a boolean');
    });
});
//# sourceMappingURL=index.test.js.map