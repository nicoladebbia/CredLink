/**
 * Setup Custody - Initialize database and provision first tenant key
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupCustody() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  });

  try {
    console.log('Setting up custody database schema...');

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);

    console.log('✅ Database schema created successfully');

    // Optionally provision a test tenant key
    if (process.env.SETUP_TEST_TENANT === 'true') {
      const testTenant = process.env.TEST_TENANT_ID || 'test-tenant';
      console.log(`Provisioning test key for tenant: ${testTenant}`);

      // This would call the custody service
      console.log('⚠️  Test tenant provisioning requires custody service to be running');
      console.log(
        `   Run: curl -X POST http://localhost:4000/custody/tenants/${testTenant}/keys \\ -H "Content-Type: application/json" \\ -d '{"mode":"aws-kms","rotation":"90d","region":"us-east-1"}'`
      );
    }

    console.log('\n✅ Custody setup complete');
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupCustody();
