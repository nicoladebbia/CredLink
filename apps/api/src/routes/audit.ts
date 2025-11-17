import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ audits: [], timestamp: new Date().toISOString() });
});

export { router as auditRouter };
