const fs = require('fs');
const path = require('path');

// 1. Analyze server.js
const serverContent = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
const serverLines = serverContent.split('\n');

const backendRoutes = [];
for (let i = 0; i < serverLines.length; i++) {
  const line = serverLines[i];
  const match = line.match(/fastify\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i);
  if (match) {
    backendRoutes.push({
      method: match[1].toUpperCase(),
      path: match[2],
      line: i + 1,
      norm: match[2].replace(/:[a-zA-Z0-9_]+/g, ':param').replace(/\/$/, '')
    });
  }
}

// 2. Analyze all frontend files
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

          const urlMatch = snippet.match(/fetch\(\s*([`'"][^`'"]+[`'"])/);
          let rawUrl = '';
          if (urlMatch) {
            rawUrl = urlMatch[1].replace(/[`'"]/g, '');
          }
          if (!rawUrl) continue;

          let norm = rawUrl
            .replace(/\$\{(apiBase|propApiBase|url|clean|base|masterUrl|apiUrl|apiEndpoint)[^}]*\}/gi, '')
            .replace(/^http:\/\/[^/]+/, '')
            .split('?')[0]
            .replace(/\$\{[^}]+\}/g, ':param')
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

// 3. Match backend calls
const uncalledBackend = [];
for (const be of backendRoutes) {
  const isCalled = frontendCalls.some(fe => fe.method === be.method && (fe.norm === be.norm || fe.norm === be.norm.replace(/:\w+/g, ':param')));
  if (!isCalled) {
    // Check if an alias was called (e.g. /api/products called instead of /products)
    let hasAliasCalled = false;
    if (be.path.startsWith('/api/')) {
      const nonApi = be.norm.replace('/api/', '/');
      hasAliasCalled = frontendCalls.some(fe => fe.method === be.method && fe.norm === nonApi);
    } else {
      const apiVer = '/api' + be.norm;
      hasAliasCalled = frontendCalls.some(fe => fe.method === be.method && fe.norm === apiVer);
    }

    uncalledBackend.push({
      method: be.method,
      path: be.path,
      line: be.line,
      hasAliasCalled
    });
  }
}

// 4. Inspect Prisma Schema models vs Frontend usage
const prismaPath = path.resolve(__dirname, '../prisma/contract.prisma');
const prismaContent = fs.readFileSync(prismaPath, 'utf8');
const models = [];
const modelMatches = prismaContent.matchAll(/model\s+(\w+)\s+\{([^}]+)\}/g);
for (const m of modelMatches) {
  const modelName = m[1];
  const fields = m[2].trim().split('\n').map(l => l.trim().split(/\s+/)[0]).filter(f => f && !f.startsWith('//') && !f.startsWith('@@'));
  models.push({ modelName, fields });
}

// 5. Look for mock fallbacks in frontend
const mockFallbacks = [];
function findMocks(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findMocks(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const relPath = path.relative(path.resolve(__dirname, '..'), fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.includes('// Mock') ||
          line.includes('// Fallback demo') ||
          line.includes('mock_') ||
          (line.includes('fallback') && line.includes('mock'))
        ) {
          mockFallbacks.push({
            file: relPath,
            line: i + 1,
            code: line.trim()
          });
        }
      }
    }
  }
}
findMocks(srcDir);

const output = {
  totalBackendRoutes: backendRoutes.length,
  totalFrontendFetchCalls: frontendCalls.length,
  uncalledBackendCount: uncalledBackend.length,
  uncalledBackendWithoutAlias: uncalledBackend.filter(b => !b.hasAliasCalled).length,
  uncalledBackendList: uncalledBackend,
  mockFallbacksInFrontend: mockFallbacks,
  prismaModels: models.map(m => m.modelName)
};

fs.writeFileSync(path.resolve(__dirname, '../master_audit_results.json'), JSON.stringify(output, null, 2));
console.log('Master audit completed! Saved to master_audit_results.json');
console.log('Uncalled Backend without alias:', output.uncalledBackendWithoutAlias);
console.log('Mock fallbacks in frontend:', output.mockFallbacksInFrontend.length);
