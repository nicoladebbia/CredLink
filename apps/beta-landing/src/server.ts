import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Beta application interface
interface BetaApplication {
    name: string;
    email: string;
    company?: string;
    role?: string;
    useCase: string;
    volume?: string;
    timestamp: string;
    ip?: string;
}

// Store applications in JSON file (for simplicity)
const APPLICATIONS_FILE = path.join(__dirname, '../data/applications.json');

// Ensure data directory exists
async function ensureDataDirectory(): Promise<void> {
    const dataDir = path.join(__dirname, '../data');
    try {
        await fs.access(dataDir);
    } catch {
        await fs.mkdir(dataDir, { recursive: true });
    }
}

// Load existing applications
async function loadApplications(): Promise<BetaApplication[]> {
    try {
        const data = await fs.readFile(APPLICATIONS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Save applications
async function saveApplications(applications: BetaApplication[]): Promise<void> {
    await fs.writeFile(APPLICATIONS_FILE, JSON.stringify(applications, null, 2));
}

// Validate email format
function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Beta application endpoint
app.post('/api/beta/apply', async (req: Request, res: Response) => {
    try {
        const { name, email, company, role, useCase, volume } = req.body;

        // Validation
        if (!name || !email || !useCase) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Name, email, and use case are required'
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                error: 'Invalid email',
                message: 'Please provide a valid email address'
            });
        }

        if (useCase.length < 20) {
            return res.status(400).json({
                error: 'Use case too short',
                message: 'Please provide more details about your use case (at least 20 characters)'
            });
        }

        // Create application object
        const application: BetaApplication = {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            company: company?.trim(),
            role: role?.trim(),
            useCase: useCase.trim(),
            volume: volume?.trim(),
            timestamp: new Date().toISOString(),
            ip: req.ip || (req.headers['x-forwarded-for'] as string | undefined)
        };

        // Load existing applications
        const applications = await loadApplications();

        // Check for duplicate email
        const existingApplication = applications.find(app => app.email === application.email);
        if (existingApplication) {
            return res.status(409).json({
                error: 'Duplicate application',
                message: 'An application with this email already exists'
            });
        }

        // Add new application
        applications.push(application);

        // Save to file
        await saveApplications(applications);

        // Log to console
        console.log('New beta application:', {
            name: application.name,
            email: application.email,
            company: application.company,
            timestamp: application.timestamp
        });

        // Send success response
        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: applications.length
        });

    } catch (error) {
        console.error('Error processing beta application:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to process application. Please try again.'
        });
    }
});

// Get all applications (admin endpoint - should be protected in production)
app.get('/api/beta/applications', async (req: Request, res: Response) => {
    try {
        // In production, add authentication here
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid admin key'
            });
        }

        const applications = await loadApplications();
        res.json({
            total: applications.length,
            applications
        });
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to fetch applications'
        });
    }
});

// Export applications as CSV (admin endpoint)
app.get('/api/beta/export', async (req: Request, res: Response) => {
    try {
        // In production, add authentication here
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid admin key'
            });
        }

        const applications = await loadApplications();

        // Create CSV
        const headers = ['Name', 'Email', 'Company', 'Role', 'Use Case', 'Volume', 'Timestamp', 'IP'];
        const rows = applications.map(app => [
            app.name,
            app.email,
            app.company || '',
            app.role || '',
            app.useCase,
            app.volume || '',
            app.timestamp,
            app.ip || ''
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=beta-applications.csv');
        res.send(csv);

    } catch (error) {
        console.error('Error exporting applications:', error);
        res.status(500).json({
            error: 'Server error',
            message: 'Failed to export applications'
        });
    }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function start(): Promise<void> {
    await ensureDataDirectory();
    
    app.listen(PORT, () => {
        console.log(`Beta landing page server running on http://localhost:${PORT}`);
        console.log(`Admin API key: ${process.env.ADMIN_KEY || 'not set'}`);
    });
}

start().catch(console.error);

export default app;
