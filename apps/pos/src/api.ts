import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const getBaseUrl = () => {
  let envUrl = import.meta.env.VITE_API_BASE_URL;

  if (envUrl) {
    let cleanUrl = envUrl.replace(/\/+$/, '');
    // Auto-correct old environment variables missing the -8010 port suffix
    if (cleanUrl.includes('layali-git.up.railway.app') && !cleanUrl.includes('8010')) {
      cleanUrl = 'https://layali-git-8010.up.railway.app';
    }
    return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
  }

  // Android emulator host loopback
  if (Capacitor.getPlatform() === 'android') {
    return 'http://10.0.2.2:4000/api';
  }

  // Cloud Production fallback (Railway)
  return 'https://layali-git-8010.up.railway.app/api';
};

export const api = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
    // Force the browser to skip the disk cache for API requests
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_cashier_token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// Auto-logout on invalid or expired token
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('erp_cashier_token');
      // If you use React Router, you can also force a redirect here:
      // window.location.href = '/'; 
    }
    return Promise.reject(error);
  }
);
