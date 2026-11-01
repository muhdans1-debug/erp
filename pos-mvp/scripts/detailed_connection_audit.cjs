const fs = require('fs');
const path = require('path');

// 1. Read server.js and extract all endpoints
const serverContent = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
const serverLines = serverContent.split('\n');

const backendEndpoints = [];
for (let i = 0; i < serverLines.length; i++) {
  const line = serverLines[i];
  const match = line.match(/fastify\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i);
  if (match) {
    backendEndpoints.push({
      method: match[1].toUpperCase(),
      path: match[2],
      line: i + 1,
      norm: match[2].replace(/:[a-zA-Z0-9_]+/g, ':param').replace(/\/$/, '')
    });
  }
}

// 2. Scan all .tsx and .ts files in src
const srcDir = path.resolve(__dirname, '../src');
const frontendCalls = [];

function scanFrontend(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanFrontend(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const relPath = path.relative(path.resolve(__dirname, '..'), fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('fetch(')) {
          const snippet = lines.slice(i, Math.min(lines.length, i + 8)).join('\n');
          
          let method = 'GET';
          const methodMatch = snippet.match(/method:\s*['"](GET|POST|PUT|DELETE|PATCH)['"]/i);
          if (methodMatch) method = methodMatch[1].toUpperCase();

          // Extract URL
          const urlMatch = snippet.match(/fetch\(\s*([`'"][^`'"]+[`'"])/);
          let rawUrl = '';
          if (urlMatch) {
            rawUrl = urlMatch[1].replace(/[`'"]/g, '');
          }

          if (!rawUrl) continue;

          // Normalize:
          // Turn ${apiBase}/api/customers/${id}/settle into /api/customers/:param/settle
          let norm = rawUrl
            .replace(/\$\{(apiBase|propApiBase|url|clean|base|masterUrl|apiUrl|apiEndpoint)[^}]*\}/gi, '') // strip base variable
            .replace(/^http:\/\/[^/]+/, '') // strip http host if hardcoded
            .split('?')[0] // strip query string
            .replace(/\$\{[^}]+\}/g, ':param') // replace inner variables with :param
            .replace(/\/+/g, '/')
            .replace(/\/$/, '');

          if (!norm.startsWith('/')) norm = '/' + norm;

          frontendCalls.push({
            file: relPath,
            line: i + 1,
            method,
            rawUrl,
            norm
          });
        }
      }
    }
  }
}
scanFrontend(srcDir);

// 3. Match frontend calls against backend endpoints
const trueDisconnectedFrontend = [];
const connectedFrontend = [];

for (const call of frontendCalls) {
  if (call.rawUrl.startsWith('https://wa.me')) continue;

  const match = backendEndpoints.find(be => be.method === call.method && (be.norm === call.norm || be.norm === call.norm.replace(/:\w+/g, ':param')));
  if (match) {
    connectedFrontend.push({ call, backend: match });
  } else {
    // Check if path exists with different method
    const anyMethod = backendEndpoints.filter(be => be.norm === call.norm);
    trueDisconnectedFrontend.push({
      ...call,
      availableMethodsInBackend: anyMethod.map(m => `${m.method} on line ${m.line}`)
    });
  }
}

// 4. Find backend endpoints never called by frontend
const uncalledBackend = backendEndpoints.filter(be => {
  return !frontendCalls.some(call => call.method === be.method && call.norm === be.norm);
});

// Group uncalled backend by domain
const uncalledByDomain = {};
for (const b of uncalledBackend) {
  let domain = 'Other';
  if (b.path.includes('/khata') || b.path.includes('/customers')) domain = 'Khata & Customers';
  else if (b.path.includes('/products') || b.path.includes('/inventory') || b.path.includes('/purchase-orders') || b.path.includes('/distributors') || b.path.includes('/po')) domain = 'Products & Inventory';
  else if (b.path.includes('/sales')) domain = 'Sales & POS';
  else if (b.path.includes('/reports') || b.path.includes('/shifts') || b.path.includes('/expenses')) domain = 'Reports & Audits';
  else if (b.path.includes('/sync')) domain = 'Sync Engine';
  else if (b.path.includes('/system') || b.path.includes('/config')) domain = 'System & Backups';

  if (!uncalledByDomain[domain]) uncalledByDomain[domain] = [];
  uncalledByDomain[domain].push(`${b.method} ${b.path} (L${b.line})`);
}

// 5. Look for UI buttons with missing or stub handlers
const stubButtons = [];
function checkButtons(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      checkButtons(fullPath);
    } else if (file.endsWith('.tsx')) {
      const relPath = path.relative(path.resolve(__dirname, '..'), fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.includes('alert(') ||
          line.includes('console.log("TODO') ||
          line.includes('// TODO') ||
          line.includes('onClick={() => {}}') ||
          line.includes('onClick={() => { }}') ||
          line.includes('coming soon') ||
          line.includes('Coming soon')
        ) {
          stubButtons.push({
            file: relPath,
            line: i + 1,
            code: line.trim()
          });
        }
      }
    }
  }
}
checkButtons(srcDir);

const report = {
  summary: {
    totalBackendEndpoints: backendEndpoints.length,
    totalFrontendApiCalls: frontendCalls.length,
    fullyConnectedCalls: connectedFrontend.length,
    trulyDisconnectedCalls: trueDisconnectedFrontend.length,
    backendEndpointsUncalledByFrontend: uncalledBackend.length,
    stubOrPlaceholderButtonsInUI: stubButtons.length
  },
  trulyDisconnectedCalls: trueDisconnectedFrontend,
  stubOrPlaceholderButtonsInUI: stubButtons,
  uncalledBackendEndpointsCountByDomain: Object.fromEntries(
    Object.entries(uncalledByDomain).map(([k, v]) => [k, v.length])
  ),
  uncalledBackendEndpointsGrouped: uncalledByDomain
};

fs.writeFileSync(path.resolve(__dirname, '../audit_report_clean.json'), JSON.stringify(report, null, 2));
console.log('Clean audit report generated!');
console.log(JSON.stringify(report.summary, null, 2));
if (report.trulyDisconnectedCalls.length > 0) {
  console.log('TRULY DISCONNECTED FRONTEND CALLS:');
  console.log(report.trulyDisconnectedCalls);
} else {
  console.log('NO DISCONNECTED FRONTEND CALLS! All frontend fetch calls have matching backend handlers.');
}
