const fs = require('fs');
const contract = JSON.parse(fs.readFileSync('pos-mvp/prisma/contract.json', 'utf8'));
const domainModels = contract.domain?.models || contract.storage?.models || {};
console.log('domain.models:', Object.keys(domainModels));
if (domainModels.Product) {
  console.log('Product fields:', Object.keys(domainModels.Product.fields || {}));
}
const storageModels = contract.storage?.models || {};
console.log('storage.models:', Object.keys(storageModels));
if (storageModels.Product) {
  console.log('storage Product fields:', Object.keys(storageModels.Product.fields || {}));
}

