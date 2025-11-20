import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { requirePermission } from '../middleware/rbac-auth';

const router: Router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({ audits: [], timestamp: new Date().toISOString() });
});

export { router as auditRouter };
