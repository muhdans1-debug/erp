const fs = require('fs');
const contract = JSON.parse(fs.readFileSync('pos-mvp/prisma/contract.json', 'utf8'));
function findKeys(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'Product') {
      console.log('Found Product at path:', path + '.' + k, Object.keys(v));
      if (v.fields) console.log('Product.fields:', Object.keys(v.fields));
    } else if (typeof v === 'object') {
      findKeys(v, path + '.' + k);
    }
  }
}
findKeys(contract);

