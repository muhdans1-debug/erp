import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

console.log('Verifying stripped UI navigation options in PWA...');

// 1. HamburgerDrawer.jsx must not have link to "/"
const drawerSrc = fs.readFileSync(path.join(root, 'src/components/HamburgerDrawer.jsx'), 'utf8');
assert(!drawerSrc.includes('to="/"'), 'HamburgerDrawer should NOT link to root ("/")');
assert(!drawerSrc.includes('<Search className="w-3.5 h-3.5" />'), 'Search icon link should be removed from drawer');

// 2. CustomerTab.jsx must not have switch account link
const tabSrc = fs.readFileSync(path.join(root, 'src/pages/CustomerTab.jsx'), 'utf8');
assert(!tabSrc.includes('to="/?switch=1"'), 'CustomerTab should NOT contain link to /?switch=1');
assert(!tabSrc.includes('to="/?reset=1"'), 'CustomerTab should NOT contain link to /?reset=1');

// 3. App.jsx must not have isReset bypass in RootDispatcher
const appSrc = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
assert(!appSrc.includes('isReset'), 'RootDispatcher should NOT have isReset bypass');
assert(!appSrc.includes('switch === \'1\''), 'RootDispatcher should NOT allow switch query param bypass');

console.log('✅ UI stripping verification passed: Zero inter-account switching links remain!');
