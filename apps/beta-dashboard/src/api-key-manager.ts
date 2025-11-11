import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * API Key Manager
 * 
 * Handles generation, storage, and validation of beta customer API keys
 */

interface BetaCustomer {
    id: string;
    name: string;
    email: string;
    company: string;
    apiKey: string;
    createdAt: string;
    status: 'active' | 'suspended' | 'expired';
    usage: {
        totalRequests: number;
        signRequests: number;
        verifyRequests: number;
        proofsStored: number;
        lastRequestAt?: string;
    };
    limits: {
        requestsPerDay: number;
        requestsPerMonth: number;
    };
}

export class APIKeyManager {
    private customersFile: string;
    private keysFile: string;

    constructor(dataDir: string = './data') {
        this.customersFile = path.join(dataDir, 'beta-customers.json');
        this.keysFile = path.join(dataDir, 'api-keys.json');
    }

    /**
     * Generate a secure API key
     */
    generateAPIKey(): string {
        const prefix = 'cl_beta';
        const randomBytes = crypto.randomBytes(32).toString('hex');
        return `${prefix}_${randomBytes}`;
    }

    /**
     * Create a new beta customer with API key
     */
    async createCustomer(data: {
        name: string;
        email: string;
        company: string;
    }): Promise<BetaCustomer> {
        const customer: BetaCustomer = {
            id: crypto.randomUUID(),
            name: data.name,
            email: data.email,
            company: data.company,
            apiKey: this.generateAPIKey(),
            createdAt: new Date().toISOString(),
            status: 'active',
            usage: {
                totalRequests: 0,
                signRequests: 0,
                verifyRequests: 0,
                proofsStored: 0
            },
            limits: {
                requestsPerDay: 10000, // Unlimited during beta
                requestsPerMonth: 300000
            }
        };

        // Load existing customers
        const customers = await this.loadCustomers();
        
        // Check for duplicate email
        const existing = customers.find(c => c.email === data.email);
        if (existing) {
            throw new Error(`Customer with email ${data.email} already exists`);
        }

        // Add new customer
        customers.push(customer);
        await this.saveCustomers(customers);

        // Update API keys index
        await this.updateKeysIndex(customer.apiKey, customer.id);

        return customer;
    }

    /**
     * Get customer by API key
     */
    async getCustomerByAPIKey(apiKey: string): Promise<BetaCustomer | null> {
        const keys = await this.loadKeys();
        const customerId = keys[apiKey];
        
        if (!customerId) {
            return null;
        }

        const customers = await this.loadCustomers();
        return customers.find(c => c.id === customerId) || null;
    }

    /**
     * Get customer by ID
     */
    async getCustomerById(id: string): Promise<BetaCustomer | null> {
        const customers = await this.loadCustomers();
        return customers.find(c => c.id === id) || null;
    }

    /**
     * Get customer by email
     */
    async getCustomerByEmail(email: string): Promise<BetaCustomer | null> {
        const customers = await this.loadCustomers();
        return customers.find(c => c.email === email) || null;
    }

    /**
     * Get all customers
     */
    async getAllCustomers(): Promise<BetaCustomer[]> {
        return await this.loadCustomers();
    }

    /**
     * Update customer usage
     */
    async updateUsage(apiKey: string, type: 'sign' | 'verify'): Promise<void> {
        const customer = await this.getCustomerByAPIKey(apiKey);
        if (!customer) {
            throw new Error('Customer not found');
        }

        customer.usage.totalRequests++;
        if (type === 'sign') {
            customer.usage.signRequests++;
            customer.usage.proofsStored++;
        } else {
            customer.usage.verifyRequests++;
        }
        customer.usage.lastRequestAt = new Date().toISOString();

        await this.updateCustomer(customer);
    }

    /**
     * Update customer
     */
    async updateCustomer(customer: BetaCustomer): Promise<void> {
        const customers = await this.loadCustomers();
        const index = customers.findIndex(c => c.id === customer.id);
        
        if (index === -1) {
            throw new Error('Customer not found');
        }

        customers[index] = customer;
        await this.saveCustomers(customers);
    }

    /**
     * Suspend customer
     */
    async suspendCustomer(id: string): Promise<void> {
        const customer = await this.getCustomerById(id);
        if (!customer) {
            throw new Error('Customer not found');
        }

        customer.status = 'suspended';
        await this.updateCustomer(customer);
    }

    /**
     * Reactivate customer
     */
    async reactivateCustomer(id: string): Promise<void> {
        const customer = await this.getCustomerById(id);
        if (!customer) {
            throw new Error('Customer not found');
        }

        customer.status = 'active';
        await this.updateCustomer(customer);
    }

    /**
     * Validate API key
     */
    async validateAPIKey(apiKey: string): Promise<boolean> {
        const customer = await this.getCustomerByAPIKey(apiKey);
        return customer !== null && customer.status === 'active';
    }

    /**
     * Get customer stats
     */
    async getStats(): Promise<{
        totalCustomers: number;
        activeCustomers: number;
        suspendedCustomers: number;
        totalRequests: number;
        totalProofs: number;
    }> {
        const customers = await this.loadCustomers();
        
        return {
            totalCustomers: customers.length,
            activeCustomers: customers.filter(c => c.status === 'active').length,
            suspendedCustomers: customers.filter(c => c.status === 'suspended').length,
            totalRequests: customers.reduce((sum, c) => sum + c.usage.totalRequests, 0),
            totalProofs: customers.reduce((sum, c) => sum + c.usage.proofsStored, 0)
        };
    }

    /**
     * Load customers from file
     */
    private async loadCustomers(): Promise<BetaCustomer[]> {
        try {
            const data = await fs.readFile(this.customersFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    /**
     * Save customers to file
     */
    private async saveCustomers(customers: BetaCustomer[]): Promise<void> {
        await fs.writeFile(this.customersFile, JSON.stringify(customers, null, 2));
    }

    /**
     * Load API keys index
     */
    private async loadKeys(): Promise<Record<string, string>> {
        try {
            const data = await fs.readFile(this.keysFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    /**
     * Save API keys index
     */
    private async saveKeys(keys: Record<string, string>): Promise<void> {
        await fs.writeFile(this.keysFile, JSON.stringify(keys, null, 2));
    }

    /**
     * Update API keys index
     */
    private async updateKeysIndex(apiKey: string, customerId: string): Promise<void> {
        const keys = await this.loadKeys();
        keys[apiKey] = customerId;
        await this.saveKeys(keys);
    }
}

export default APIKeyManager;
