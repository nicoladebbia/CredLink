/**
 * Verification Policy Engine
 * Manages and applies verification policies for C2PA manifests
 * Enhanced with strict validation and security controls
 */
/**
 * Verification policy engine for C2PA manifests
 */
export class VerificationPolicyEngine {
    static MAX_POLICIES = 100;
    static MAX_RULES_PER_POLICY = 50;
    static MAX_CONDITION_LENGTH = 1000;
    static ALLOWED_OPERATORS = ['==', '!=', '>', '<', '>=', '<=', '&&', '||', '!'];
    policies = new Map();
    activePolicies = new Set();
    constructor() {
        this.loadDefaultPolicies();
    }
    /**
     * Add a verification policy
     */
    addPolicy(policy) {
        // Validate policy
        this.validatePolicy(policy);
        // Check limits
        if (this.policies.size >= VerificationPolicyEngine.MAX_POLICIES) {
            throw new Error('Maximum number of policies exceeded');
        }
        // Add to policies
        this.policies.set(policy.id, { ...policy });
        // Add to active policies if marked as active
        if (policy.active) {
            this.activePolicies.add(policy.id);
        }
    }
    /**
     * Remove a verification policy
     */
    removePolicy(policyId) {
        if (!policyId || typeof policyId !== 'string') {
            throw new Error('Policy ID must be a non-empty string');
        }
        const removed = this.policies.delete(policyId);
        if (removed) {
            this.activePolicies.delete(policyId);
        }
        return removed;
    }
    /**
     * Get a verification policy
     */
    getPolicy(policyId) {
        if (!policyId || typeof policyId !== 'string') {
            throw new Error('Policy ID must be a non-empty string');
        }
        const policy = this.policies.get(policyId);
        return policy ? { ...policy } : undefined;
    }
    /**
     * List all verification policies
     */
    listPolicies() {
        return Array.from(this.policies.values()).map(policy => ({ ...policy }));
    }
    /**
     * List active verification policies
     */
    listActivePolicies() {
        return Array.from(this.activePolicies)
            .map(id => this.policies.get(id))
            .filter(policy => policy !== undefined)
            .map(policy => ({ ...policy }));
    }
    /**
     * Activate a policy
     */
    activatePolicy(policyId) {
        if (!policyId || typeof policyId !== 'string') {
            throw new Error('Policy ID must be a non-empty string');
        }
        const policy = this.policies.get(policyId);
        if (!policy) {
            return false;
        }
        policy.active = true;
        this.activePolicies.add(policyId);
        return true;
    }
    /**
     * Deactivate a policy
     */
    deactivatePolicy(policyId) {
        if (!policyId || typeof policyId !== 'string') {
            throw new Error('Policy ID must be a non-empty string');
        }
        const policy = this.policies.get(policyId);
        if (!policy) {
            return false;
        }
        policy.active = false;
        this.activePolicies.delete(policyId);
        return true;
    }
    /**
     * Evaluate manifest against active policies
     */
    evaluateManifest(manifest) {
        if (!manifest || typeof manifest !== 'object') {
            throw new Error('Manifest must be a valid object');
        }
        const appliedRules = [];
        const warnings = [];
        const errors = [];
        let allowed = true;
        try {
            // Get active policies
            const activePolicies = this.listActivePolicies();
            for (const policy of activePolicies) {
                for (const rule of policy.rules) {
                    try {
                        const result = this.evaluateRule(rule, manifest);
                        appliedRules.push(result);
                        if (result.matched) {
                            switch (result.result) {
                                case 'denied':
                                    allowed = false;
                                    errors.push(`Policy ${policy.id} - Rule ${rule.id}: ${rule.description}`);
                                    break;
                                case 'warning':
                                    warnings.push(`Policy ${policy.id} - Rule ${rule.id}: ${rule.description}`);
                                    break;
                                case 'allowed':
                                    // Rule passed, no action needed
                                    break;
                            }
                        }
                    }
                    catch (error) {
                        const errorMsg = `Policy ${policy.id} - Rule ${rule.id}: Evaluation failed - ${error}`;
                        errors.push(errorMsg);
                        // Critical rule failures result in denial
                        if (rule.severity === 'critical') {
                            allowed = false;
                        }
                    }
                }
            }
        }
        catch (error) {
            errors.push(`Policy evaluation failed: ${error}`);
            allowed = false;
        }
        return {
            allowed,
            applied_rules: appliedRules,
            warnings,
            errors,
            evaluated_at: new Date().toISOString()
        };
    }
    /**
     * Evaluate a single rule against a manifest
     */
    evaluateRule(rule, manifest) {
        const context = this.buildRuleContext(rule, manifest);
        const matched = this.evaluateCondition(rule.condition, context);
        let result = 'allowed';
        if (matched) {
            switch (rule.action) {
                case 'deny':
                    result = 'denied';
                    break;
                case 'warn':
                    result = 'warning';
                    break;
                case 'allow':
                    result = 'allowed';
                    break;
            }
        }
        return {
            rule: { ...rule },
            matched,
            result,
            context: { ...context }
        };
    }
    /**
     * Build context for rule evaluation
     */
    buildRuleContext(rule, manifest) {
        const context = {
            manifest,
            rule_type: rule.type,
            timestamp: new Date().toISOString()
        };
        // Add specific context based on rule type
        switch (rule.type) {
            case 'signature':
                context['signature'] = manifest.claim_signature;
                context['has_signature'] = !!manifest.claim_signature;
                context['signature_algorithm'] = manifest.claim_signature?.protected?.alg;
                context['signature_valid'] = manifest.claim_signature?.validation_status?.valid;
                break;
            case 'assertion':
                context['assertions'] = manifest.assertions || [];
                context['assertion_count'] = (manifest.assertions || []).length;
                context['has_actions'] = (manifest.assertions || []).some(a => a.label === 'c2pa.actions');
                context['has_ingredients'] = (manifest.assertions || []).some(a => a.label === 'c2pa.ingredients');
                break;
            case 'ingredient':
                context['ingredients'] = manifest.ingredients || [];
                context['ingredient_count'] = (manifest.ingredients || []).length;
                break;
            case 'timestamp':
                context['timestamp'] = manifest.timestamp;
                context['has_timestamp'] = !!manifest.timestamp;
                context['timestamp_valid'] = this.isValidTimestamp(manifest.timestamp);
                break;
            case 'manifest':
                context['manifest_hash'] = manifest.manifest_hash;
                context['claim_generator'] = manifest.claim_generator;
                context['version'] = manifest.claim_generator_version;
                context['manifest_valid'] = manifest.claim_signature?.validation_status?.valid;
                break;
        }
        return context;
    }
    /**
     * Validate timestamp format
     */
    isValidTimestamp(timestamp) {
        if (!timestamp || typeof timestamp !== 'string') {
            return false;
        }
        const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
        if (!iso8601Regex.test(timestamp)) {
            return false;
        }
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= 2050;
    }
    /**
     * Evaluate rule condition
     */
    evaluateCondition(condition, context) {
        if (!condition || typeof condition !== 'string') {
            throw new Error('Condition must be a non-empty string');
        }
        if (condition.length > VerificationPolicyEngine.MAX_CONDITION_LENGTH) {
            throw new Error('Condition too long');
        }
        try {
            // Safe condition evaluator - prevents code injection
            let evalCondition = condition.trim();
            // Validate allowed operators
            const hasInvalidOperators = VerificationPolicyEngine.ALLOWED_OPERATORS.some(op => evalCondition.includes(op) && !this.isValidOperatorUsage(evalCondition, op));
            if (hasInvalidOperators) {
                throw new Error('Invalid operator usage in condition');
            }
            // Replace context variables safely
            evalCondition = this.replaceContextVariables(evalCondition, context);
            // Evaluate simple expressions safely
            return this.evaluateSimpleExpression(evalCondition);
        }
        catch (error) {
            throw new Error(`Condition evaluation failed: ${error}`);
        }
    }
    /**
     * Validate operator usage
     */
    isValidOperatorUsage(condition, operator) {
        // Basic validation to prevent dangerous operations
        if (operator === '!' && condition.includes('!!')) {
            return false; // Prevent double negation that could hide issues
        }
        return true;
    }
    /**
     * Replace context variables safely
     */
    replaceContextVariables(condition, context) {
        let result = condition;
        // Replace known variables with their string representations
        const replacements = {
            'has_signature': String(context['has_signature'] || false),
            'has_timestamp': String(context['has_timestamp'] || false),
            'has_actions': String(context['has_actions'] || false),
            'has_ingredients': String(context['has_ingredients'] || false),
            'signature_valid': String(context['signature_valid'] || false),
            'timestamp_valid': String(context['timestamp_valid'] || false),
            'manifest_valid': String(context['manifest_valid'] || false),
            'assertion_count': String(context['assertion_count'] || 0),
            'ingredient_count': String(context['ingredient_count'] || 0),
            'signature_algorithm': String(context['signature_algorithm'] || ''),
        };
        for (const [variable, value] of Object.entries(replacements)) {
            const regex = new RegExp(`\\b${variable}\\b`, 'g');
            result = result.replace(regex, value);
        }
        return result;
    }
    /**
     * Evaluate simple expressions safely
     */
    evaluateSimpleExpression(expression) {
        // Remove any remaining potential dangerous characters
        const cleanExpression = expression.replace(/[^0-9.=!<>&|() ]/g, '');
        // Handle basic comparisons
        if (cleanExpression.includes('==')) {
            const parts = cleanExpression.split('==').map(p => p.trim());
            return parts[0] === parts[1];
        }
        if (cleanExpression.includes('!=')) {
            const parts = cleanExpression.split('!=').map(p => p.trim());
            return parts[0] !== parts[1];
        }
        if (cleanExpression.includes('>=')) {
            const parts = cleanExpression.split('>=').map(p => p.trim());
            return Number(parts[0]) >= Number(parts[1]);
        }
        if (cleanExpression.includes('<=')) {
            const parts = cleanExpression.split('<=').map(p => p.trim());
            return Number(parts[0]) <= Number(parts[1]);
        }
        if (cleanExpression.includes('>')) {
            const parts = cleanExpression.split('>').map(p => p.trim());
            return Number(parts[0]) > Number(parts[1]);
        }
        if (cleanExpression.includes('<')) {
            const parts = cleanExpression.split('<').map(p => p.trim());
            return Number(parts[0]) < Number(parts[1]);
        }
        // Simple boolean evaluation
        return cleanExpression === 'true';
    }
    /**
     * Validate a verification policy
     */
    validatePolicy(policy) {
        if (!policy.id || typeof policy.id !== 'string' || policy.id.length > 100) {
            throw new Error('Policy ID is required, must be a string, and max 100 characters');
        }
        if (!policy.name || typeof policy.name !== 'string' || policy.name.length > 200) {
            throw new Error('Policy name is required, must be a string, and max 200 characters');
        }
        if (!policy.version || typeof policy.version !== 'string' || policy.version.length > 50) {
            throw new Error('Policy version is required, must be a string, and max 50 characters');
        }
        if (!Array.isArray(policy.rules)) {
            throw new Error('Policy rules must be an array');
        }
        if (policy.rules.length === 0) {
            throw new Error('Policy must have at least one rule');
        }
        if (policy.rules.length > VerificationPolicyEngine.MAX_RULES_PER_POLICY) {
            throw new Error('Policy exceeds maximum number of rules');
        }
        // Validate each rule
        for (const rule of policy.rules) {
            this.validateRule(rule);
        }
    }
    /**
     * Validate a policy rule
     */
    validateRule(rule) {
        if (!rule.id || typeof rule.id !== 'string' || rule.id.length > 100) {
            throw new Error('Rule ID is required, must be a string, and max 100 characters');
        }
        if (!rule.condition || typeof rule.condition !== 'string') {
            throw new Error('Rule condition is required and must be a string');
        }
        if (rule.condition.length > VerificationPolicyEngine.MAX_CONDITION_LENGTH) {
            throw new Error('Rule condition exceeds maximum length');
        }
        if (!['allow', 'deny', 'warn'].includes(rule.action)) {
            throw new Error('Rule action must be one of: allow, deny, warn');
        }
        if (!['info', 'warning', 'error', 'critical'].includes(rule.severity)) {
            throw new Error('Rule severity must be one of: info, warning, error, critical');
        }
        if (!['signature', 'assertion', 'ingredient', 'timestamp', 'manifest'].includes(rule.type)) {
            throw new Error('Rule type must be one of: signature, assertion, ingredient, timestamp, manifest');
        }
        if (!rule.description || typeof rule.description !== 'string' || rule.description.length > 500) {
            throw new Error('Rule description is required, must be a string, and max 500 characters');
        }
    }
    /**
     * Load default verification policies
     */
    loadDefaultPolicies() {
        // Basic signature verification policy
        const signaturePolicy = {
            id: 'basic-signature-verification',
            name: 'Basic Signature Verification',
            description: 'Ensures manifests have valid cryptographic signatures',
            version: '1.0.0',
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            rules: [
                {
                    id: 'require-signature',
                    type: 'signature',
                    condition: 'has_signature == true',
                    action: 'deny',
                    severity: 'error',
                    description: 'Manifest must have a signature'
                },
                {
                    id: 'require-valid-algorithm',
                    type: 'signature',
                    condition: 'signature_algorithm == "ES256" || signature_algorithm == "RS256"',
                    action: 'warn',
                    severity: 'warning',
                    description: 'Signature should use a supported algorithm'
                }
            ]
        };
        // Basic assertion verification policy
        const assertionPolicy = {
            id: 'basic-assertion-verification',
            name: 'Basic Assertion Verification',
            description: 'Ensures manifests have required assertions',
            version: '1.0.0',
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            rules: [
                {
                    id: 'require-actions',
                    type: 'assertion',
                    condition: 'has_actions == true',
                    action: 'deny',
                    severity: 'error',
                    description: 'Manifest must have c2pa.actions assertion'
                },
                {
                    id: 'limit-assertions',
                    type: 'assertion',
                    condition: 'assertion_count <= 100',
                    action: 'warn',
                    severity: 'warning',
                    description: 'Manifest should not have too many assertions'
                }
            ]
        };
        // Basic timestamp verification policy
        const timestampPolicy = {
            id: 'basic-timestamp-verification',
            name: 'Basic Timestamp Verification',
            description: 'Ensures manifests have valid timestamps',
            version: '1.0.0',
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            rules: [
                {
                    id: 'require-timestamp',
                    type: 'timestamp',
                    condition: 'has_timestamp == true',
                    action: 'deny',
                    severity: 'error',
                    description: 'Manifest must have a timestamp'
                },
                {
                    id: 'require-valid-timestamp',
                    type: 'timestamp',
                    condition: 'timestamp_valid == true',
                    action: 'deny',
                    severity: 'error',
                    description: 'Manifest timestamp must be valid'
                }
            ]
        };
        this.addPolicy(signaturePolicy);
        this.addPolicy(assertionPolicy);
        this.addPolicy(timestampPolicy);
    }
    /**
     * Get policy statistics
     */
    getStatistics() {
        const policies = Array.from(this.policies.values());
        const policyTypes = {};
        let totalRules = 0;
        for (const policy of policies) {
            totalRules += policy.rules.length;
            for (const rule of policy.rules) {
                policyTypes[rule.type] = (policyTypes[rule.type] || 0) + 1;
            }
        }
        return {
            totalPolicies: policies.length,
            activePolicies: this.activePolicies.size,
            totalRules,
            policyTypes
        };
    }
    /**
     * Export policies to JSON
     */
    exportToJSON() {
        const policies = this.listPolicies();
        return JSON.stringify(policies, null, 2);
    }
    /**
     * Import policies from JSON
     */
    importFromJSON(json) {
        if (!json || typeof json !== 'string') {
            throw new Error('JSON must be a non-empty string');
        }
        let policies;
        try {
            policies = JSON.parse(json);
            if (!Array.isArray(policies)) {
                throw new Error('JSON must be an array of policies');
            }
            if (policies.length > VerificationPolicyEngine.MAX_POLICIES) {
                throw new Error('Too many policies in import');
            }
        }
        catch (error) {
            throw new Error(`Failed to parse JSON: ${error}`);
        }
        // Clear existing policies
        this.policies.clear();
        this.activePolicies.clear();
        // Import new policies
        for (const policy of policies) {
            this.addPolicy(policy);
        }
    }
}
//# sourceMappingURL=verification-policy.js.map