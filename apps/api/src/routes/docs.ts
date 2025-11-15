/**
 * API Documentation Routes (Swagger/OpenAPI)
 * Fixes Issue #5: No API Documentation Page
 */

import { Router, type Router as RouterType } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

const router: RouterType = Router();

// Load OpenAPI specification
const swaggerDocument = YAML.load(path.join(__dirname, '../../openapi.yaml'));

// Swagger UI options
const options = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CredLink API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true
  }
};

// Serve Swagger UI
router.use('/api-docs', swaggerUi.serve);
router.get('/api-docs', swaggerUi.setup(swaggerDocument, options));

// Serve raw OpenAPI spec
router.get('/openapi.json', (req, res) => {
  res.json(swaggerDocument);
});

router.get('/openapi.yaml', (req, res) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.sendFile(path.join(__dirname, '../../openapi.yaml'));
});

export default router;
