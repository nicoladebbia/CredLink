import { Router, Request, Response } from 'express';

const router: Router = Router();

// Simple test route to verify Express routing works
router.get('/test', (req: Request, res: Response) => {
  console.log('🔥 DEBUG: Test route handler called');
  res.json({ message: 'Test route works', timestamp: new Date().toISOString() });
});

// Test detailed route
router.get('/detailed', (req: Request, res: Response) => {
  console.log('🔥 DEBUG: Detailed test route handler called');
  res.json({ 
    status: 'healthy', 
    message: 'Detailed test route works',
    timestamp: new Date().toISOString() 
  });
});

// Test metrics route
router.get('/metrics', (req: Request, res: Response) => {
  console.log('🔥 DEBUG: Metrics test route handler called');
  res.json({ 
    message: 'Metrics test route works',
    timestamp: new Date().toISOString() 
  });
});

export { router as testHealthRouter };
