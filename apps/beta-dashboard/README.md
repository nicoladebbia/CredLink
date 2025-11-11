# CredLink Beta Dashboard

API key management and customer dashboard for beta program.

## Features

- **API Key Generation**: Secure key generation for beta customers
- **Customer Management**: Create, suspend, reactivate customers
- **Usage Tracking**: Monitor API calls, proofs stored, requests
- **Admin Dashboard**: View all customers and stats
- **Customer Dashboard**: Self-service usage view

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Visit http://localhost:3003
```

### Production

```bash
# Build
npm run build

# Start production server
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
PORT=3003
ADMIN_KEY=your-secure-admin-key
NODE_ENV=production
```

## API Endpoints

### Admin Endpoints

**Create Customer**
```bash
POST /api/admin/customers
X-Admin-Key: your-admin-key
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@company.com",
  "company": "Acme Corp"
}
```

**Get All Customers**
```bash
GET /api/admin/customers
X-Admin-Key: your-admin-key
```

**Get Customer by ID**
```bash
GET /api/admin/customers/:id
X-Admin-Key: your-admin-key
```

**Suspend Customer**
```bash
POST /api/admin/customers/:id/suspend
X-Admin-Key: your-admin-key
```

**Reactivate Customer**
```bash
POST /api/admin/customers/:id/reactivate
X-Admin-Key: your-admin-key
```

**Get Stats**
```bash
GET /api/admin/stats
X-Admin-Key: your-admin-key
```

### Customer Endpoints

**Get Own Info**
```bash
GET /api/customer/me
X-API-Key: customer-api-key
```

**Validate API Key**
```bash
POST /api/validate
Content-Type: application/json

{
  "apiKey": "cl_beta_..."
}
```

**Record Usage**
```bash
POST /api/usage
X-API-Key: customer-api-key
Content-Type: application/json

{
  "type": "sign"
}
```

## Data Storage

Customer data is stored in JSON files:
- `data/beta-customers.json` - Customer records
- `data/api-keys.json` - API key index

## API Key Format

```
cl_beta_[64_character_hex_string]
```

Example:
```
cl_beta_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

## Customer Object

```typescript
{
  id: string;              // UUID
  name: string;            // Customer name
  email: string;           // Customer email
  company: string;         // Company name
  apiKey: string;          // API key
  createdAt: string;       // ISO timestamp
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
```

## Usage Tracking

Track customer usage:
1. Customer makes API call
2. API calls `/api/usage` endpoint
3. Usage is recorded
4. Dashboard updates

## Security

### API Keys
- Generated with `crypto.randomBytes(32)`
- 64-character hex strings
- Prefixed with `cl_beta_`
- Stored securely

### Admin Access
- Protected by admin key
- Set via environment variable
- Required for all admin endpoints

### Customer Access
- Protected by API key
- Validated on each request
- Status checked (active/suspended)

## Monitoring

### Metrics
- Total customers
- Active customers
- Suspended customers
- Total API requests
- Total proofs stored

### Logs
- Customer creation
- API key validation
- Usage updates
- Errors

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
EXPOSE 3003
CMD ["node", "dist/dashboard-server.js"]
```

### AWS ECS

Use existing ECS infrastructure:
1. Build Docker image
2. Push to ECR
3. Update task definition
4. Deploy to ECS

## Development

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

### Testing

```bash
npm test
```

## Support

For issues or questions:
- Email: support@credlink.com
- GitHub Issues: [link]

## License

Proprietary - CredLink 2025
