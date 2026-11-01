const { createClient } = require('@libsql/client');
require('dotenv').config({ path: './.env' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  const cInfo = await client.execute("PRAGMA table_info('Customer')");
  console.log('Customer columns:', cInfo.rows);

  const kcExists = await client.execute("PRAGMA table_info('KhataCustomer')");
  console.log('KhataCustomer columns:', kcExists.rows);
}

main().catch(console.error);

