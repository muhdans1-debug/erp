import fs from 'fs';
import path from 'path';

const srcDir = path.resolve('pos-mvp/src');

function getAllFiles(dir, exts = ['.tsx', '.ts', '.css']) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = getAllFiles(srcDir);
let modifiedCount = 0;

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // 1. Strip backdrop-blur classes (backdrop-blur-xs, backdrop-blur-sm, backdrop-blur-md, backdrop-blur, etc.)
  // Matches \s*backdrop-blur(-[a-z0-9]+)?
  content = content.replace(/\bbackdrop-blur(-[a-z0-9]+)?\b\s*/g, '');

  // 2. In QuickProductGrid.tsx, strip scale transforms and transitions
  if (file.endsWith('QuickProductGrid.tsx')) {
    content = content.replace(/active:scale-95 transition-all/g, 'active:opacity-85');
    content = content.replace(/animate-pulse/g, '');
    content = content.replace(/animate-bounce/g, '');
  }

  // 3. In PaymentModal.tsx, strip scale transforms and transitions on buttons
  if (file.endsWith('PaymentModal.tsx')) {
    content = content.replace(/active:scale-95 transition-transform/g, 'active:opacity-85');
    content = content.replace(/active:scale-95 transition-all/g, 'active:opacity-85');
    content = content.replace(/transition-all active:scale-95/g, 'active:opacity-85');
  }

  // 4. In CheckoutScreen.tsx, strip high-latency scale transforms on touch buttons
  if (file.endsWith('CheckoutScreen.tsx')) {
    content = content.replace(/active:scale-95 transition-all/g, 'active:opacity-85');
    content = content.replace(/active:scale-95 transition-transform/g, 'active:opacity-85');
    content = content.replace(/transition-all active:scale-95/g, 'active:opacity-85');
    content = content.replace(/transition-transform active:scale-95/g, 'active:opacity-85');
    content = content.replace(/active:scale-95/g, 'active:opacity-85');
  }

  // 5. In F12SearchOverlay.tsx, strip backdrop blur
  if (file.endsWith('F12SearchOverlay.tsx')) {
    content = content.replace(/active:scale-95 transition-all/g, 'active:opacity-85');
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log(`Optimized: ${path.relative(process.cwd(), file)}`);
  }
}

console.log(`\nSuccessfully stripped backdrop-blur and animation bottlenecks across ${modifiedCount} files.`);
