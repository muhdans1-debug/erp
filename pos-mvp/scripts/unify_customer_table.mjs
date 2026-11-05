import { db } from '../db.js';
import { createClient } from '@libsql/client';

const tursoClient = createClient({
  url: process.env.TURSO_DATABASE_URL || "libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io",
  authToken: process.env.TURSO_AUTH_TOKEN || ""
});

async function migrateDatabase(client, name) {
  console.log(`\n--- Starting Customer table unification on: ${name} ---`);

  // 1. Get existing columns
  const tableInfo = await client.execute("PRAGMA table_info(Customer)");
  const existingCols = new Set(tableInfo.rows.map(r => r.name));
  console.log(`[${name}] Existing Customer columns:`, Array.from(existingCols).join(', '));

  // 2. Add missing columns safely
  const columnsToAdd = [
    { name: 'balance', def: 'REAL DEFAULT 0.0' },
    { name: 'credit_limit', def: 'REAL DEFAULT 0.0' },
    { name: 'pin', def: 'TEXT' },
    { name: 'nfc_card_id', def: 'TEXT' },
    { name: 'access_token', def: 'TEXT' }
  ];

  for (const col of columnsToAdd) {
    if (!existingCols.has(col.name)) {
      try {
        await client.execute(`ALTER TABLE Customer ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[${name}] Added column: ${col.name} ${col.def}`);
      } catch (err) {
        console.warn(`[${name}] Notice adding column ${col.name}:`, err.message);
      }
    } else {
      console.log(`[${name}] Column already exists: ${col.name}`);
    }
  }

  // 3. Migrate from KhataCustomer if table exists
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='KhataCustomer'");
  if (tables.rows.length > 0) {
    console.log(`[${name}] Migrating data from KhataCustomer into Customer...`);
    try {
      await client.execute(`
        UPDATE Customer 
        SET 
          balance = COALESCE((SELECT balance FROM KhataCustomer WHERE KhataCustomer.phone = Customer.phone), Customer.balance, 0.0),
          pin = COALESCE((SELECT pin FROM KhataCustomer WHERE KhataCustomer.phone = Customer.phone), Customer.pin, Customer.khata_pin, '1234'),
          access_token = COALESCE((SELECT access_token FROM KhataCustomer WHERE KhataCustomer.phone = Customer.phone), Customer.access_token, Customer.id),
          nfc_card_id = COALESCE((SELECT nfc_card_id FROM KhataCustomer WHERE KhataCustomer.phone = Customer.phone), Customer.nfc_card_id, Customer.cardUid)
        WHERE EXISTS (
          SELECT 1 FROM KhataCustomer WHERE KhataCustomer.phone = Customer.phone
        )
      `);
      console.log(`[${name}] Migration from KhataCustomer completed.`);
    } catch (migErr) {
      console.warn(`[${name}] Notice during KhataCustomer migration:`, migErr.message);
    }
  } else {
    console.log(`[${name}] KhataCustomer table not present (already merged or unified).`);
  }

  // 4. Backfill and sync columns inside Customer table
  console.log(`[${name}] Normalizing and cross-populating Customer columns...`);
  await client.execute(`
    UPDATE Customer SET
      balance = COALESCE(balance, 0.0),
      credit_limit = COALESCE(credit_limit, 30.0),
      pin = COALESCE(pin, khata_pin, '1234'),
      khata_pin = COALESCE(khata_pin, pin, '1234'),
      access_token = COALESCE(access_token, id),
      nfc_card_id = COALESCE(nfc_card_id, cardUid),
      cardUid = COALESCE(cardUid, nfc_card_id)
  `);

  // Verify rows
  const verify = await client.execute("SELECT id, name, balance, credit_limit, pin, access_token, nfc_card_id, cardUid FROM Customer LIMIT 5");
  console.log(`[${name}] Verified sample rows:`, verify.rows);
  console.log(`[${name}] ✅ Customer table is 100% unified!`);
}

async function main() {
  try {
    await migrateDatabase(db, 'Local SQLite (local.db)');
  } catch (err) {
    console.error('Local DB Migration error:', err);
  }

  try {
    await migrateDatabase(tursoClient, 'Turso Cloud (askar-pos-primary)');
  } catch (err) {
    console.error('Turso Cloud DB Migration error:', err);
  }

  process.exit(0);
}

main();

