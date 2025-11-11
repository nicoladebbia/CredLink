# CredLink Beta Landing Page

Simple, conversion-focused landing page for CredLink beta program.

## Features

- **Clean Design**: Minimal, professional design focused on conversion
- **Beta Application Form**: Collects name, email, company, and use case
- **Responsive**: Mobile-friendly design
- **API Backend**: Express.js server for form submissions
- **Admin Dashboard**: View and export applications

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Visit http://localhost:3002
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
PORT=3002
ADMIN_KEY=your-secure-admin-key
NODE_ENV=production
```

## API Endpoints

### Public Endpoints

**Submit Beta Application**
```bash
POST /api/beta/apply
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@company.com",
  "company": "Acme Corp",
  "role": "CTO",
  "useCase": "We need to verify product photos...",
  "volume": "10k-100k"
}
```

**Health Check**
```bash
GET /health
```

### Admin Endpoints

**Get All Applications**
```bash
GET /api/beta/applications
X-Admin-Key: your-admin-key
```

**Export Applications (CSV)**
```bash
GET /api/beta/export
X-Admin-Key: your-admin-key
```

## File Structure

```
apps/beta-landing/
├── public/
│   ├── index.html      # Landing page HTML
│   ├── styles.css      # Styles
│   └── app.js          # Client-side JavaScript
├── src/
│   └── server.ts       # Express server
├── data/
│   └── applications.json  # Stored applications
├── package.json
├── tsconfig.json
└── README.md
```

## Features

### Landing Page
- Hero section with clear value proposition
- Visual demo of how it works
- Benefits section (4 key benefits)
- Use cases (6 industries)
- How it works (3 steps with code examples)
- Application form
- FAQ section (5 questions)
- Footer with links

### Form Validation
- Required fields: name, email, use case
- Email format validation
- Use case minimum length (20 characters)
- Duplicate email detection
- Client-side and server-side validation

### Data Storage
- Applications stored in JSON file
- Includes timestamp and IP address
- CSV export for analysis

## Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Deploy to Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --prod
```

### Deploy to AWS

Use the existing ECS infrastructure:

```bash
# Build Docker image
docker build -t credlink-beta-landing .

# Push to ECR
# Deploy to ECS
```

## Customization

### Update Content

Edit `public/index.html` to change:
- Hero text
- Benefits
- Use cases
- FAQ answers

### Update Styles

Edit `public/styles.css` to change:
- Colors (CSS variables in `:root`)
- Fonts
- Layout
- Spacing

### Update Form Fields

1. Add field to `public/index.html`
2. Update interface in `src/server.ts`
3. Update validation logic

## Analytics

Add Google Analytics by including in `public/index.html`:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## Security

### Production Checklist

- [ ] Set strong `ADMIN_KEY`
- [ ] Enable HTTPS
- [ ] Add rate limiting
- [ ] Add CAPTCHA (optional)
- [ ] Sanitize user input
- [ ] Set up CORS properly
- [ ] Enable CSP headers

### Rate Limiting

Add to `src/server.ts`:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5 // limit each IP to 5 requests per windowMs
});

app.use('/api/beta/apply', limiter);
```

## Monitoring

### View Applications

```bash
curl -H "X-Admin-Key: your-key" http://localhost:3002/api/beta/applications
```

### Export to CSV

```bash
curl -H "X-Admin-Key: your-key" http://localhost:3002/api/beta/export > applications.csv
```

## Support

For issues or questions:
- Email: support@credlink.com
- GitHub Issues: [link]

## License

Proprietary - CredLink 2025
