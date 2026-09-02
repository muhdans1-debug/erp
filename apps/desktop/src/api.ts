import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://127.0.0.1:4000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});