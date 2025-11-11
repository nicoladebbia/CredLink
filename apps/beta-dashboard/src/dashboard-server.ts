import express, { Request, Response } from 'express';
import path from 'path';
import APIKeyManager from './api-key-manager';

const app = express();
const PORT = process.env.PORT || 3003;
const apiKeyManager = new APIKeyManager(path.join(__dirname, '../data'));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Admin authentication middleware
const adminAuth = (req: Request, res: Response, next: express.NextFunction): void => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
};

/**
 * Create new beta customer
 */
app.post('/api/admin/customers', adminAuth, async (req: Request, res: Response) => {
    try {
        const { name, email, company } = req.body;

        if (!name || !email || !company) {
            res.status(400).json({
                error: 'Missing required fields',
                message: 'Name, email, and company are required'
            });
            return;
        }

        const customer = await apiKeyManager.createCustomer({ name, email, company });

        res.status(201).json({
            success: true,
            customer: {
                id: customer.id,
                name: customer.name,
                email: customer.email,
                company: customer.company,
                apiKey: customer.apiKey,
                createdAt: customer.createdAt
            }
        });
    } catch (error) {
        const err = error as Error;
        if (err.message.includes('already exists')) {
            res.status(409).json({ error: 'Duplicate customer', message: err.message });
            return;
        }
        console.error('Error creating customer:', error);
        res.status(500).json({ error: 'Server error', message: 'Failed to create customer' });
    }
});

/**
 * Get all customers
 */
app.get('/api/admin/customers', adminAuth, async (req: Request, res: Response) => {
    try {
        const customers = await apiKeyManager.getAllCustomers();
        res.json({ customers });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Get customer by ID
 */
app.get('/api/admin/customers/:id', adminAuth, async (req: Request, res: Response) => {
    try {
        const customer = await apiKeyManager.getCustomerById(req.params.id);
        if (!customer) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
        res.json({ customer });
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Suspend customer
 */
app.post('/api/admin/customers/:id/suspend', adminAuth, async (req: Request, res: Response) => {
    try {
        await apiKeyManager.suspendCustomer(req.params.id);
        res.json({ success: true, message: 'Customer suspended' });
    } catch (error) {
        console.error('Error suspending customer:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Reactivate customer
 */
app.post('/api/admin/customers/:id/reactivate', adminAuth, async (req: Request, res: Response) => {
    try {
        await apiKeyManager.reactivateCustomer(req.params.id);
        res.json({ success: true, message: 'Customer reactivated' });
    } catch (error) {
        console.error('Error reactivating customer:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Get stats
 */
app.get('/api/admin/stats', adminAuth, async (req: Request, res: Response) => {
    try {
        const stats = await apiKeyManager.getStats();
        res.json({ stats });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Customer dashboard - Get own info
 */
app.get('/api/customer/me', async (req: Request, res: Response) => {
    try {
        const apiKey = req.headers['x-api-key'] as string;
        
        if (!apiKey) {
            res.status(401).json({ error: 'API key required' });
            return;
        }

        const customer = await apiKeyManager.getCustomerByAPIKey(apiKey);
        
        if (!customer) {
            res.status(401).json({ error: 'Invalid API key' });
            return;
        }

        res.json({
            customer: {
                id: customer.id,
                name: customer.name,
                email: customer.email,
                company: customer.company,
                status: customer.status,
                usage: customer.usage,
                limits: customer.limits,
                createdAt: customer.createdAt
            }
        });
    } catch (error) {
        console.error('Error fetching customer info:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Validate API key
 */
app.post('/api/validate', async (req: Request, res: Response) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey) {
            res.status(400).json({ error: 'API key required' });
            return;
        }

        const isValid = await apiKeyManager.validateAPIKey(apiKey);
        
        res.json({ valid: isValid });
    } catch (error) {
        console.error('Error validating API key:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Record API usage
 */
app.post('/api/usage', async (req: Request, res: Response) => {
    try {
        const apiKey = req.headers['x-api-key'] as string;
        const { type } = req.body;

        if (!apiKey) {
            res.status(401).json({ error: 'API key required' });
            return;
        }

        if (!type || !['sign', 'verify'].includes(type)) {
            res.status(400).json({ error: 'Invalid type', message: 'Type must be "sign" or "verify"' });
            return;
        }

        await apiKeyManager.updateUsage(apiKey, type as 'sign' | 'verify');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error recording usage:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Start server
 */
async function start(): Promise<void> {
    app.listen(PORT, () => {
        console.log(`Beta dashboard server running on http://localhost:${PORT}`);
        console.log(`Admin API key: ${process.env.ADMIN_KEY || 'not set'}`);
    });
}

start().catch(console.error);

export default app;
