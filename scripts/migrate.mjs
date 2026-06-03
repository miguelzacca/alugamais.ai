/**
 * Direct DB migration script using @libsql/client
 * Run: node scripts/migrate.mjs
 */
import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const migrations = [
  // Create owners table
  `CREATE TABLE IF NOT EXISTS owners (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    document TEXT,
    email TEXT,
    phone TEXT,
    bank_name TEXT,
    bank_agency TEXT,
    bank_account TEXT,
    bank_pix_key TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  // Add owner_id to properties
  `ALTER TABLE properties ADD COLUMN owner_id TEXT REFERENCES owners(id)`,

  // Add commission fields to rentals
  `ALTER TABLE rentals ADD COLUMN commission_type TEXT NOT NULL DEFAULT 'percentage'`,
  `ALTER TABLE rentals ADD COLUMN commission_rate REAL NOT NULL DEFAULT 10`,
  `ALTER TABLE rentals ADD COLUMN administration_fee REAL DEFAULT 0`,
  `ALTER TABLE rentals ADD COLUMN owner_payment_day INTEGER DEFAULT 10`,

  // Rename/add columns on monthly_charges
  // First add new columns (SQLite doesn't support rename column in old versions)
  `ALTER TABLE monthly_charges ADD COLUMN base_rent REAL`,
  `ALTER TABLE monthly_charges ADD COLUMN total_fees REAL`,
  `ALTER TABLE monthly_charges ADD COLUMN gross_amount REAL`,
  `ALTER TABLE monthly_charges ADD COLUMN commission_amount REAL`,
  `ALTER TABLE monthly_charges ADD COLUMN administration_fee REAL DEFAULT 0`,
  `ALTER TABLE monthly_charges ADD COLUMN total_commission REAL`,
  `ALTER TABLE monthly_charges ADD COLUMN owner_amount REAL`,
  `ALTER TABLE monthly_charges ADD COLUMN owner_paid INTEGER DEFAULT 0`,

  // Backfill new columns from existing data
  `UPDATE monthly_charges SET
    base_rent = COALESCE(base_rent, total_amount, 0),
    total_fees = COALESCE(total_fees, 0),
    gross_amount = COALESCE(gross_amount, total_amount, 0),
    commission_amount = COALESCE(commission_amount, 0),
    total_commission = COALESCE(total_commission, 0),
    owner_amount = COALESCE(owner_amount, total_amount, 0)
  WHERE base_rent IS NULL OR gross_amount IS NULL`,

  // Create owner_remittances table
  `CREATE TABLE IF NOT EXISTS owner_remittances (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    charge_id TEXT,
    amount REAL NOT NULL,
    remitted_at INTEGER NOT NULL,
    payment_method TEXT DEFAULT 'pix',
    notes TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES owners(id),
    FOREIGN KEY (charge_id) REFERENCES monthly_charges(id)
  )`,

  // Users table - add agency_name column if not exists
  `ALTER TABLE users ADD COLUMN agency_name TEXT`,
];

console.log('🚀 Running migrations...\n');
let success = 0;
let skipped = 0;

for (const sql of migrations) {
  const label = sql.trim().split('\n')[0].substring(0, 80);
  try {
    await client.execute(sql);
    console.log(`✅ ${label}`);
    success++;
  } catch (err) {
    if (
      err.message?.includes('duplicate column') ||
      err.message?.includes('already exists') ||
      err.message?.includes('UNIQUE constraint')
    ) {
      console.log(`⏭️  SKIP (already exists): ${label}`);
      skipped++;
    } else {
      console.warn(`⚠️  WARN: ${err.message}\n   SQL: ${label}`);
      skipped++;
    }
  }
}

console.log(`\n✨ Done! ${success} applied, ${skipped} skipped.`);
process.exit(0);
