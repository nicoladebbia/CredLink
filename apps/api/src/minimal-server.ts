// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

import express from 'express';
import { env } from './config/env';

const app = express();
const PORT = env.PORT || 3001;

// Simple health endpoint that returns expected format
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Minimal API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
