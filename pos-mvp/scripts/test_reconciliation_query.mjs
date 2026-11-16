import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const c = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function run() {
  const query = `
    SELECT 
      s.id, 
      s.openedAt as opened_at, 
      s.closedAt as closed_at, 
      s.openingCash as starting_cash, 
      s.closingCash as actual_cash, 
      s.status, 
      s.notes, 
      s.cashierName as cashier_name, 
      s.employeeId as employee_id, 
      COALESCE(SUM(CASE WHEN UPPER(sa.paymentType) = 'CASH' AND sa.total > 0 THEN sa.total ELSE 0 END), 0) as cash_sales, 
      COALESCE(SUM(CASE WHEN (UPPER(sa.paymentType) LIKE '%BENEFIT%' OR UPPER(sa.paymentType) = 'CARD') AND sa.total > 0 THEN sa.total ELSE 0 END), 0) as digital_sales, 
      COALESCE(SUM(CASE WHEN (UPPER(sa.paymentType) LIKE '%KHATA%' OR UPPER(sa.paymentType) LIKE '%CREDIT%') AND sa.total > 0 THEN sa.total ELSE 0 END), 0) as khata_sales
    FROM Shift s 
    LEFT JOIN Sale sa ON sa.shiftId = s.id 
    GROUP BY s.id 
    ORDER BY s.openedAt DESC 
    LIMIT 10;
  `;
  const res = await c.execute(query);
  console.log('Reconciliation count:', res.rows.length);
  console.log('First 2 rows:', res.rows.slice(0, 2));
}

run().catch(console.error);
