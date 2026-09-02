import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const getBaseUrl = () => {
  let envUrl = import.meta.env.VITE_API_BASE_URL;

  // Auto-correct old environment variables missing the -8010 port suffix
  if (envUrl === 'https://layali-git.up.railway.app' || envUrl === 'https://layali-git.up.railway.app/') {
    envUrl = 'https://layali-git-8010.up.railway.app';
  }

  if (envUrl) {
    let cleanUrl = envUrl.replace(/\/$/, '');
    if (cleanUrl === 'https://layali-git.up.railway.app') {
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
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_cashier_token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});