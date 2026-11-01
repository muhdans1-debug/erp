const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes("'/products'") || l.includes("'/api/products'")) {
    console.log(i + 1, l);
  }
});
