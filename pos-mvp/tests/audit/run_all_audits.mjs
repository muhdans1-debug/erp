// pos-mvp/tests/audit/run_all_audits.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { run as runAuthTests } from './01_auth_boundary.test.mjs';
import { run as runLedgerTests } from './02_ledger_invariants.test.mjs';
import { run as runSyncTests } from './03_edge_sync_divergence.test.mjs';
import { run as runApiTests } from './04_api_contracts_fuzz.test.mjs';
import { run as runHardwareTests } from './05_hardware_reliability.test.mjs';
import { run as runTenantTests } from './06_multitenant_isolation.test.mjs';
import { run as runDashboardTests } from './07_admin_dashboard.test.mjs';
import { run as runKhataPwaTests } from './08_khata_pwa_security.test.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMasterAudit() {
  const startTime = Date.now();
  console.log('\n========================================================================');
  console.log('🚀 ASKAR POS & ERP ENTERPRISE CONTINUOUS AUDIT & VERIFICATION SUITE');
  console.log('   Timestamp:', new Date().toISOString());
  console.log('   Target Node: http://127.0.0.1:3000 (Local Sunmi Edge Master)');
  console.log('========================================================================\n');

  const testSuites = [
    { name: 'Part 1: Auth & Access Boundary', fn: runAuthTests },
    { name: 'Part 2: Khata Ledger & Financial Invariants', fn: runLedgerTests },
    { name: 'Part 3: Offline-First Sync & Concurrency', fn: runSyncTests },
    { name: 'Part 4: API Contracts & Input Fuzzing', fn: runApiTests },
    { name: 'Part 5: Hardware Peripherals & Reliability', fn: runHardwareTests },
    { name: 'Part 6: Multi-Tenant & Fleet Security', fn: runTenantTests },
    { name: 'Part 7: Admin Dashboard & Hardware Bridge', fn: runDashboardTests },
    { name: 'Part 8: Customer Khata PWA, Scale & Restock', fn: runKhataPwaTests }
  ];

  const results = [];
  let grandTotal = 0;
  let grandPassed = 0;

  for (const suite of testSuites) {
    try {
      const res = await suite.fn();
      results.push({ name: suite.name, ...res });
      grandTotal += res.total;
      grandPassed += res.passed;
    } catch (err) {
      console.error(`Fatal suite failure:`, err.message);
      results.push({ name: suite.name, passed: 0, total: 1, error: err.message });
      grandTotal += 1;
    }
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const healthScore = grandTotal > 0 ? ((grandPassed / grandTotal) * 100).toFixed(1) : 0;

  console.log('\n========================================================================');
  console.log('📊 MASTER AUDIT SCORECARD & HEALTH VERIFICATION MATRIX');
  console.log('========================================================================');
  console.log(`⏱️  Duration: ${elapsedSec}s`);
  console.log(`🎯 Overall Pass Rate: ${grandPassed} / ${grandTotal} (${healthScore}%)`);
  console.log('------------------------------------------------------------------------');

  for (const r of results) {
    const icon = r.passed === r.total ? '✅' : '❌';
    const pct = r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0;
    console.log(` ${icon} ${r.name.padEnd(46, '.')} [${r.passed}/${r.total}] (${pct}%)`);
  }
  console.log('========================================================================\n');

  // Save latest markdown summary
  const reportPath = path.resolve(__dirname, 'LATEST_AUDIT_REPORT.md');
  const markdownReport = `# 🛡️ Askar POS & ERP Automated Audit Scorecard
- **Execution Date**: ${new Date().toISOString()}
- **Duration**: ${elapsedSec}s
- **Overall System Health Score**: **${healthScore}%** (${grandPassed}/${grandTotal} Tests Passed)

## 📊 Domain Test Breakdown
| Suite / Domain | Tests Passed | Total Tests | Status |
|---|:---:|:---:|:---:|
${results.map((r) => `| ${r.name} | ${r.passed} | ${r.total} | ${r.passed === r.total ? '✅ PASS' : '⚠️ FAIL'} |`).join('\n')}

---
*Generated autonomously by Project Sentinel Invariant Harness.*
`;

  fs.writeFileSync(reportPath, markdownReport, 'utf8');
  console.log(`📄 Markdown scorecard written to: ${reportPath}`);

  if (grandPassed === grandTotal) {
    console.log('\n🎉 ALL ARCHITECTURAL, WORKFLOW, API, AND AUTH INVARIANTS PASSED!\n');
    process.exit(0);
  } else {
    console.warn(`\n⚠️  WARNING: ${grandTotal - grandPassed} tests failed or detected potential drift.\n`);
    process.exit(1);
  }
}

runMasterAudit().catch((err) => {
  console.error('Fatal master audit crash:', err);
  process.exit(1);
});
