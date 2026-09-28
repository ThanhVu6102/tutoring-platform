import axios from 'axios';

// Khi deploy fullstack trên cùng 1 domain Vercel: để trống -> dùng relative '/api/...'
// Khi backend deploy riêng (Render/Railway): set REACT_APP_API_URL=https://your-backend-url
export const API_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

if (API_URL) {
  axios.defaults.baseURL = API_URL;
}

axios.defaults.headers.common['Content-Type'] = 'application/json';

// Tự gắn token cho mọi request nếu có
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axios;
