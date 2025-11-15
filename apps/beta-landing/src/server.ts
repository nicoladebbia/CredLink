/**
 * Beta Landing Page Server
 * Simple Express server with API endpoint for beta signups
 */

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

const app: Express = express();
const PORT = process.env.BETA_PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://www.google-analytics.com"],
    }
  }
}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Beta signup endpoint
app.post('/api/beta-signup', async (req, res) => {
  try {
    const { name, email, company, useCase } = req.body;

    // Validation
    if (!name || !email) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Name and email are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid email address'
      });
    }

    // TODO: Store in database (for now, just log)
    console.log('Beta signup:', { name, email, company, useCase });

    // TODO: Send confirmation email

    // Success response
    res.status(200).json({
      success: true,
      message: 'Successfully added to beta waitlist'
    });

  } catch (error) {
    console.error('Beta signup error:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Something went wrong. Please try again later.'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Beta landing page running on http://localhost:${PORT}`);
});

export default app;
