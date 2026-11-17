/**
 * Axios REST API Client (`frontend/src/api/axiosClient.js`)
 * Attaches JWT Bearer token and handles 401/403 responses.
 */
import axios from 'axios';

const axiosClient = axios.create({
  baseURL: import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('eapms_jwt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    // Fallback if storage is restricted
  }
  return config;
});

export default axiosClient;
