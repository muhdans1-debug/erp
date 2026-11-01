const fs = require('fs');
const path = require('path');

// 1. Scan server.js for all route declarations
const serverPath = path.resolve(__dirname, '../server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const backendRoutes = [];
const routeRegex = /fastify\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
let match;
while ((match = routeRegex.exec(serverContent)) !== null) {
  backendRoutes.push({ method: match[1].toUpperCase(), path: match[2] });
}

console.log('Total backend routes found in server.js:', backendRoutes.length);

// 2. Recursively scan src/ for all fetch calls
const frontendCalls = [];

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Look for fetch( ... )
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('fetch(')) {
          // get a block around the fetch
          const block = lines.slice(i, Math.min(lines.length, i + 10)).join('\n');
          
          let method = 'GET';
          const methodMatch = block.match(/method:\s*['"](GET|POST|PUT|DELETE|PATCH)['"]/i);
          if (methodMatch) {
            method = methodMatch[1].toUpperCase();
          }

          // Extract path from line or block
          const urlMatch = block.match(/fetch\(\s*[`'"]([^`'"]+)[`'"]/);
          let rawUrl = '';
          if (urlMatch) {
            rawUrl = urlMatch[1];
          } else {
            const templateMatch = block.match(/fetch\(\s*`([^`]+)`/);
            if (templateMatch) {
              rawUrl = templateMatch[1];
            }
          }

          if (rawUrl) {
            frontendCalls.push({
              file: path.relative(path.resolve(__dirname, '..'), fullPath).replace(/\\/g, '/'),
              line: i + 1,
              method,
              rawUrl
            });
          }
        }
      }
    }
  }
}

scanDir(path.resolve(__dirname, '../src'));
console.log('Total frontend fetch calls found in src/:', frontendCalls.length);

// 3. Normalize paths to check matching
function normalizePath(p) {
  return p
    .replace(/^(\$\{apiBase\}|\$\{r\}|\$\{base\}|\$\{propApiBase\}|http:\/\/localhost:3000|http:\/\/192\.168\.\d+\.\d+:3000)/, '')
    .split('?')[0] // strip query string
    .replace(/\$\{[^}]+\}/g, ':param') // replace template vars
    .replace(/\/:[a-zA-Z0-9_]+/g, '/:param'); // normalize params
}

function normalizeBackendPath(p) {
  return p
    .split('?')[0]
    .replace(/\/:[a-zA-Z0-9_]+/g, '/:param');
}

const normalizedBackend = backendRoutes.map(b => ({
  ...b,
  normPath: normalizeBackendPath(b.path)
}));

// Cross reference frontend -> backend
const notInBackend = [];
const matchedFrontend = [];

for (const call of frontendCalls) {
  const norm = normalizePath(call.rawUrl);
  // special case for relative or external
  if (norm.startsWith('http') && !norm.includes('localhost:3000')) {
    continue; // external call or other server
  }

  const found = normalizedBackend.find(b => {
    // Check method compatibility (or if route doesn't specify method strict)
    const methodMatches = b.method === call.method;
    // Check path match
    const pathMatch = b.normPath === norm || 
                      b.normPath === norm.replace(/\/$/, '') ||
                      b.normPath.replace(/\/$/, '') === norm ||
                      (b.normPath.endsWith('/:param') && norm.endsWith('/:param'));
    return methodMatches && pathMatch;
  });

  if (!found) {
    // Check if path matches with any method
    const anyMethod = normalizedBackend.find(b => {
      return b.normPath === norm || b.normPath.replace(/\/$/, '') === norm.replace(/\/$/, '');
    });
    notInBackend.push({
      ...call,
      norm,
      methodInBackend: anyMethod ? anyMethod.method : null
    });
  } else {
    matchedFrontend.push({ call, backend: found });
  }
}

// Cross reference backend -> frontend (endpoints in backend that frontend NEVER calls)
const unusedBackend = [];
for (const b of normalizedBackend) {
  const called = frontendCalls.some(call => {
    const norm = normalizePath(call.rawUrl);
    return (b.normPath === norm || b.normPath.replace(/\/$/, '') === norm.replace(/\/$/, '')) && (b.method === call.method);
  });
  if (!called) {
    unusedBackend.push(b);
  }
}

// 4. Scan for TODOs, mock alerts, fake handlers, incomplete logic in frontend
const incompleteFeatures = [];
function scanForIncomplete(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanForIncomplete(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.match(/alert\(['"][^'"]*coming soon/i) ||
          line.match(/alert\(['"][^'"]*not implemented/i) ||
          line.match(/\/\/\s*TODO/i) ||
          line.match(/\/\/\s*FIXME/i) ||
          line.match(/mock/i) && line.includes('return') ||
          line.match(/console\.warn\(['"][^'"]*fallback/i)
        ) {
          incompleteFeatures.push({
            file: path.relative(path.resolve(__dirname, '..'), fullPath).replace(/\\/g, '/'),
            line: i + 1,
            code: line.trim()
          });
        }
      }
    }
  }
}
scanForIncomplete(path.resolve(__dirname, '../src'));

const result = {
  summary: {
    totalBackendRoutes: backendRoutes.length,
    totalFrontendFetchCalls: frontendCalls.length,
    frontendCallsMissingBackend: notInBackend.length,
    backendRoutesUncalledByFrontend: unusedBackend.length,
    incompleteOrMockPatternsInFrontend: incompleteFeatures.length
  },
  frontendCallsMissingBackend: notInBackend,
  backendRoutesUncalledByFrontend: unusedBackend,
  incompleteOrMockPatternsInFrontend: incompleteFeatures
};

fs.writeFileSync(path.resolve(__dirname, '../scratch_audit_report.json'), JSON.stringify(result, null, 2));
console.log('AUDIT COMPLETE! Output saved to scratch_audit_report.json');
console.log('Summary:');
console.log(result.summary);
