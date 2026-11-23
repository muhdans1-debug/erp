import fs from 'fs';
import path from 'path';

function checkFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const hooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer'];
  
  const match = code.match(/import\s+(?:React,\s*)?\{([^}]+)\}\s+from\s+['"]react['"]/);
  if (!match) return;
  const imported = match[1].split(',').map(s => s.trim().replace(/^type\s+/, ''));
  for (const h of hooks) {
    if (new RegExp('\\b' + h + '\\(').test(code)) {
      if (!imported.includes(h)) {
        console.log('MISSING REACT IMPORT:', h, 'in', filePath);
      }
    }
  }
}

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (f.endsWith('.jsx') || f.endsWith('.js')) checkFile(full);
  }
}

walk('askar-khata-pwa/src');
console.log('Hook check complete.');
