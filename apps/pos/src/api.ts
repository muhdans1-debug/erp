import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const getBaseUrl = () => {
  // 1. If an environment variable is explicitly provided, prioritize it
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    const cleanUrl = envUrl.replace(/\/$/, '');
    return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
  }

  // 2. Android emulator host loopback
  if (Capacitor.getPlatform() === 'android') {
    return 'http://10.0.2.2:4000/api';
  }

  // 3. Cloud Production fallback (Railway)
  return 'https://layali-git.up.railway.app/api';
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