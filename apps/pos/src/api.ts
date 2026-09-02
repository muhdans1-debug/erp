import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const getBaseUrl = () => {
  let envUrl = import.meta.env.VITE_API_BASE_URL;

  if (envUrl) {
    let cleanUrl = envUrl.replace(/\/+$/, '');
    if (cleanUrl.includes('layali-git.up.railway.app') && !cleanUrl.includes('8010')) {
      cleanUrl = 'https://layali-git-8010.up.railway.app';
    }
    return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
  }

  if (Capacitor.getPlatform() === 'android') {
    return 'http://10.0.2.2:4000/api';
  }

  return 'https://layali-git-8010.up.railway.app/api';
};

export const api = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_cashier_token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  
  // CACHE BUSTER: Force the browser to make a real network request
  if (config.method?.toUpperCase() === 'GET') {
    config.params = config.params || {};
    config.params._t = Date.now();
  }
  
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('erp_cashier_token');
    }
    return Promise.reject(error);
  }
);
