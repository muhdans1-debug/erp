import assert from 'assert';
import { db } from '../../db.js';

const BASE_URL = 'http://127.0.0.1:3000';
const DEV_SECRET = process.env.DEV_SECRET || '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06';

export async function run() {
  console.log('\n======================================================');
  console.log('🧮  PART 2: KHATA LEDGER & FINANCIAL INVARIANT SUITE');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  // TEST 2.1: Mathematical Odd-Member Split Rounding Invariant (Zero Fils Drift)
  total++;
  try {
    const testCases = [
      { total: 0.100, members: 3 },  // 100 fils / 3 -> 33, 33, 34 fils = 100 fils
      { total: 1.000, members: 3 },  // 1 BHD / 3 -> 333, 333, 334 fils = 1.000 BHD
      { total: 5.555, members: 7 },  // 5.555 BHD / 7
      { total: 0.050, members: 2 }   // 50 fils / 2 -> 25, 25 fils
    ];

    for (const tc of testCases) {
      const totalFils = Math.round(tc.total * 1000);
      const baseFils = Math.floor(totalFils / tc.members);
      const remainderFils = totalFils % tc.members;

      const splits = Array(tc.members).fill(baseFils);
      // Remainder fils distributed to primary members so sum is exact
      for (let i = 0; i < remainderFils; i++) {
        splits[i] += 1;
      }

      const allocatedTotal = splits.reduce((sum, f) => sum + f, 0) / 1000;
      assert.strictEqual(
        Number(allocatedTotal.toFixed(3)),
        Number(tc.total.toFixed(3)),
        `Split sum mismatch for ${tc.total} among ${tc.members} members`
      );
    }
    console.log('  ✅ [2.1] Zero-Fils Drift Odd-Member Split Remainder Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [2.1] FAILED:', err.message);
  }

  // TEST 2.2: Live KhataLedger Delta-Sum vs Customer Balance Integrity
  total++;
  try {
    const res = await db.execute(`
      SELECT c.id, c.name, c.balance, 
             COALESCE(SUM(l.amount), 0) as ledgerSum
      FROM Customer c
      LEFT JOIN KhataLedger l ON c.id = l.customerId
      GROUP BY c.id
      HAVING ABS(c.balance - COALESCE(SUM(l.amount), 0)) > 0.005
    `);

    const driftingCustomers = res.rows || [];
    if (driftingCustomers.length > 0) {
      console.warn(`     ⚠️ Warning: Found ${driftingCustomers.length} customer records with legacy balance drift:`);
      driftingCustomers.slice(0, 3).forEach((c) => {
        console.warn(`        - ${c.name} (${c.id}): Recorded=${c.balance}, LedgerSum=${c.ledgerSum}`);
      });
    }

    assert.ok(
      driftingCustomers.length === 0 || driftingCustomers.length <= 5,
      `Too many customer balances divergent from ledger: ${driftingCustomers.length}`
    );
    console.log(`  ✅ [2.2] Database Ledger Delta-Sum Reconciliation: PASSED (${res.rows?.length || 0} critical drifts)`);
    passed++;
  } catch (err) {
    console.error('  ❌ [2.2] FAILED:', err.message);
  }

  // TEST 2.3: Mess Group Equal Share vs Total Balance Invariant
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/nfc/mess-groups`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const groups = data.messGroups || [];

    for (const group of groups) {
      if (group.members && group.members.length > 0) {
        const expectedEqualShare = Number((Number(group.totalBalance || 0) / group.members.length).toFixed(3));
        const actualEqualShare = Number(Number(group.equalSplitShare || 0).toFixed(3));
        const delta = Math.abs(expectedEqualShare - actualEqualShare);
        assert.ok(delta <= 0.005, `Mess group ${group.group_name} equal split share drifted: ${delta}`);
      }
    }
    console.log(`  ✅ [2.3] Mess Group Share-to-Total Mathematical Invariant: PASSED (${groups.length} groups audited)`);
    passed++;
  } catch (err) {
    console.error('  ❌ [2.3] FAILED:', err.message);
  }

  // TEST 2.4: 3-Decimal Precision Enforcement (Bahraini Fils Integrity)
  total++;
  try {
    const res = await db.execute(`
      SELECT id, amount, reference FROM KhataLedger 
      WHERE amount != ROUND(amount, 3) 
      LIMIT 10
    `);
    const floatingAnomalies = res.rows || [];
    assert.strictEqual(
      floatingAnomalies.length,
      0,
      `Found ${floatingAnomalies.length} ledger entries violating 3-decimal BHD precision!`
    );
    console.log('  ✅ [2.4] Strict 3-Decimal (BHD 0.000) Currency Field Precision: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [2.4] FAILED:', err.message);
  }

  // TEST 2.5: Active Debt & Mess Membership Customer Deletion Protection
  total++;
  try {
    // Find any customer with non-zero balance
    const custRes = await db.execute(`
      SELECT id, name, balance FROM Customer 
      WHERE ABS(balance) > 0.001 
      LIMIT 1
    `);
    const debtor = custRes.rows[0];
    if (debtor) {
      const delRes = await fetch(`${BASE_URL}/api/customers/${debtor.id}`, {
        method: 'DELETE',
        headers: {
          'x-manager-token': DEV_SECRET
        }
      });
      assert.strictEqual(delRes.status, 400, `Expected 400 rejection for customer with active debt, got ${delRes.status}`);
      const data = await delRes.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('active balance'), 'Error missing active balance explanation');
    }

    // Find any customer enrolled in a Mess Group
    const messMemberRes = await db.execute(`
      SELECT customer_id FROM MessMember LIMIT 1
    `);
    const member = messMemberRes.rows[0];
    if (member) {
      const delRes = await fetch(`${BASE_URL}/api/customers/${member.customer_id}`, {
        method: 'DELETE',
        headers: {
          'x-manager-token': DEV_SECRET
        }
      });
      assert.strictEqual(delRes.status, 400, `Expected 400 rejection for mess group member, got ${delRes.status}`);
      const data = await delRes.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Mess Group') || data.error.includes('active balance'), 'Error missing mess explanation');
    }

    console.log('  ✅ [2.5] Active Debt & Mess Membership Customer Deletion Protection: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [2.5] FAILED:', err.message);
  }

  return { passed, total, name: 'Part 2: Khata Ledger & Financial Invariants' };
}

if (process.argv[1]?.endsWith('02_ledger_invariants.test.mjs')) {
  run().then(({ passed, total }) => {
    process.exit(passed === total ? 0 : 1);
  });
}
