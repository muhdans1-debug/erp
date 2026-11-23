import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { getAdminPin } from './utils/auth';

// ⚡ Auto-inject PIM Admin Handshake & Manager PIN for Sovereign Edge Gateway authentication
if (typeof localStorage !== 'undefined') {
  localStorage.removeItem('askar_manager_pin');
  localStorage.removeItem('askar_admin_pin');
  localStorage.removeItem('MANAGER_PIN');
}

if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input?.url || '');
      if (urlStr.includes('/api/') || urlStr.includes('workers.dev') || urlStr.includes(':8787')) {
        const customInit = init ? { ...init } : {};
        const adminPin = getAdminPin();
        if (customInit.headers instanceof Headers) {
          if (!customInit.headers.has('x-pos-client')) {
            customInit.headers.set('x-pos-client', 'pim-admin');
          }
          if (adminPin && !customInit.headers.has('x-manager-pin')) {
            customInit.headers.set('x-manager-pin', adminPin);
          }
        } else if (Array.isArray(customInit.headers)) {
          if (!customInit.headers.some(([k]) => k.toLowerCase() === 'x-pos-client')) {
            customInit.headers.push(['x-pos-client', 'pim-admin']);
          }
          if (adminPin && !customInit.headers.some(([k]) => k.toLowerCase() === 'x-manager-pin')) {
            customInit.headers.push(['x-manager-pin', adminPin]);
          }
        } else {
          customInit.headers = {
            'x-pos-client': 'pim-admin',
            ...(adminPin ? { 'x-manager-pin': adminPin } : {}),
            ...(customInit.headers || {})
          };
        }
        return originalFetch.call(this, input, customInit);
      }
    } catch {}
    return originalFetch.call(this, input, init);
  };
}

const getBasename = () => {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return '/admin';
  }
  return '/';
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={getBasename()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
