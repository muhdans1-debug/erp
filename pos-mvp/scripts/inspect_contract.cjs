const fs = require('fs');
const contract = JSON.parse(fs.readFileSync('pos-mvp/prisma/contract.json', 'utf8'));

// Check models in contract.json
console.log('Keys in contract.json:', Object.keys(contract));
if (contract.models) {
  console.log('Models in contract.models:', Object.keys(contract.models));
  if (contract.models.Product) {
    console.log('Product fields in contract.models:', Object.keys(contract.models.Product.fields || {}));
  }
}
// Search for "Product" anywhere in contract.json
const str = JSON.stringify(contract);
const match = str.match(/"Product"[^}]+/g);
console.log('Matches:', match ? match.slice(0, 3) : 'none');

