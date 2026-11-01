const { createClient } = require('@libsql/client');
require('dotenv').config({ path: './.env' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables in Turso:', res.rows.map(r => r.name));
}

main().catch(console.error);

