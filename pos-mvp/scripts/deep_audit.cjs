const fs = require('fs');
const path = require('path');

const serverContent = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');

// Collect all Fastify routes
const routes = [];
const rRegex = /fastify\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
let m;
while ((m = rRegex.exec(serverContent)) !== null) {
  routes.push({ method: m[1].toUpperCase(), path: m[2] });
}

console.log('=== TOTAL REGISTERED BACKEND ROUTES:', routes.length);

// Check specific routes
function hasRoute(method, endpoint) {
  return routes.some(r => r.method === method.toUpperCase() && (r.path === endpoint || r.path === endpoint.split('?')[0]));
}

console.log('GET /api/products/search:', hasRoute('GET', '/api/products/search'));
console.log('POST /products:', hasRoute('POST', '/products'));
console.log('POST /api/products:', hasRoute('POST', '/api/products'));
console.log('GET /api/reports/vat-return:', hasRoute('GET', '/api/reports/vat-return'));
console.log('GET /api/quick-products:', hasRoute('GET', '/api/quick-products'));
console.log('POST /api/quick-products/update:', hasRoute('POST', '/api/quick-products/update'));
console.log('POST /api/quick-products/swap:', hasRoute('POST', '/api/quick-products/swap'));
console.log('POST /api/quick-products/remove:', hasRoute('POST', '/api/quick-products/remove'));
console.log('POST /api/quick-products/reorder:', hasRoute('POST', '/api/quick-products/reorder'));

// Search all routes containing "search"
console.log('Routes containing "search":', routes.filter(r => r.path.includes('search')));
// Search all routes containing "vat"
console.log('Routes containing "vat":', routes.filter(r => r.path.includes('vat')));
// Search all routes containing "products"
console.log('Product routes:', routes.filter(r => r.path.includes('product')).map(r => `${r.method} ${r.path}`));
