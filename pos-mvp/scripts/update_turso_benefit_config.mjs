import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  const realConfig = {
    accountType: 'MOBILE_FAWRI',
    mobileNumber: '+973 33843855',
    merchantName: 'ASKAR SUPERMARKET',
    iban: 'BH77SBIN02740045310001',
    cprOrCr: '200012345678901',
    branchId: 'MAIN-01',
    notes: 'Scan with BenefitPay app to pay directly via Fawri+',
    updatedAt: new Date().toISOString()
  };

  await client.execute({
    sql: `INSERT INTO StoreSetting (key, value, updatedAt)
          VALUES ('benefit_account', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updatedAt = CURRENT_TIMESTAMP`,
    args: [JSON.stringify(realConfig)]
  });

  console.log('✅ StoreSetting successfully set in Turso Cloud:');
  const res = await client.execute("SELECT * FROM StoreSetting WHERE key = 'benefit_account'");
  console.log(res.rows[0]);
}

main().catch(console.error);

