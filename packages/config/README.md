# @credlink/config

Unified configuration management for CredLink applications with environment variable validation.

## Features

- Environment variable validation with Zod
- Type-safe configuration access
- Default value management
- Configuration schema validation
- TypeScript support

## Usage

```typescript
import { Config } from '@credlink/config';

const config = new Config();

// Get configuration values
const port = config.get('API_SERVICE_PORT');
const dbUrl = config.get('DATABASE_URL');

// Validate configuration
const isValid = config.validate();
console.log(isValid); // true/false

// Get all configuration
const allConfig = config.getAll();
```

## Configuration Schema

All configuration variables are validated using Zod schemas:

```typescript
const configSchema = z.object({
  // Service URLs
  WEB_URL: z.string().url().default('http://localhost:3002'),
  SIGN_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  API_SERVICE_PORT: z.number().default(3001),
  
  // Time Intervals
  DEFAULT_JOB_INTERVAL_MS: z.number().default(3600000),
  PROOF_CLEANUP_INTERVAL_MS: z.number().default(86400000),
  
  // Performance
  MEMORY_THRESHOLD_MB: z.number().default(256),
  CPU_THRESHOLD_MS: z.number().default(500),
  
  // Security
  PROOF_URI_DOMAIN: z.string().url().default('https://proofs.credlink.com'),
  PROOF_EXPIRATION_DAYS: z.number().default(365)
});
```

## Environment Variables

### Core Configuration
- `NODE_ENV`: Environment (development/staging/production)
- `LOG_LEVEL`: Logging level (error/warn/info/debug)

### Service Configuration
- `WEB_URL`: Web service URL
- `SIGN_SERVICE_URL`: Sign service URL
- `API_SERVICE_PORT`: API service port

### Time Configuration
- `DEFAULT_JOB_INTERVAL_MS`: Default job interval
- `PROOF_CLEANUP_INTERVAL_MS`: Proof cleanup interval
- `CERTIFICATE_ROTATION_INTERVAL_DAYS`: Certificate rotation interval

### Performance Configuration
- `MEMORY_THRESHOLD_MB`: Memory threshold in MB
- `CPU_THRESHOLD_MS`: CPU threshold in milliseconds
- `PERFORMANCE_VARIANCE_THRESHOLD`: Performance variance threshold

### Security Configuration
- `PROOF_URI_DOMAIN`: Proof URI domain
- `PROOF_EXPIRATION_DAYS`: Proof expiration period
- `PROOF_MAX_FILE_SIZE_BYTES`: Maximum proof file size

## API

### `get<T>(key: string): T`
Get a configuration value by key.

### `getAll(): Record<string, any>`
Get all configuration values.

### `validate(): boolean`
Validate all configuration values.

### `setDefaults(defaults: Record<string, any>): void`
Set default configuration values.

### `reload(): void`
Reload configuration from environment.

## Development

```bash
# Build
pnpm build

# Type check
pnpm type-check

# Watch mode
pnpm dev
```

## Environment Files

Create a `.env` file in your project root:

```bash
# Copy example configuration
cp .env.example .env

# Edit with your values
vim .env
```

## Validation Errors

Configuration validation will throw detailed errors:

```typescript
try {
  const config = new Config();
  config.validate();
} catch (error) {
  console.error('Configuration error:', error.message);
  // "DATABASE_URL must be a valid URL"
}
```
