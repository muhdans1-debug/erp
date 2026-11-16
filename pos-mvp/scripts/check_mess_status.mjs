import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config({ path: 'pos-mvp/.env' });

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  const groups = await client.execute("SELECT * FROM MessGroup");
  console.log("=== MESS GROUPS IN TURSO ===");
  console.log(groups.rows);

  const members = await client.execute("SELECT id, name, phone, mess_id, balance FROM Customer WHERE mess_id IS NOT NULL");
  console.log("\n=== CUSTOMERS LINKED TO MESS ===");
  console.log(members.rows);

  const cards = await client.execute("SELECT * FROM NfcCard WHERE mess_id IS NOT NULL OR card_type = 'MESS'");
  console.log("\n=== NFC CARDS LINKED TO MESS ===");
  console.log(cards.rows);

  const sales = await client.execute("SELECT id, invoiceNo, total, paymentType, createdAt FROM Sale WHERE paymentType = 'MESS_KHATA' ORDER BY createdAt DESC LIMIT 5");
  console.log("\n=== MESS SALES IN TURSO ===");
  console.log(sales.rows);

  const ledgers = await client.execute("SELECT * FROM KhataLedger WHERE reference LIKE '%Mess%' OR reference LIKE '%mess%' LIMIT 5");
  console.log("\n=== MESS KHATA LEDGERS IN TURSO ===");
  console.log(ledgers.rows);
}

main().catch(console.error);

