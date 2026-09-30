// ============================================================================
// FILE: frontend/src/config/api.js
// MỤC ĐÍCH: Cấu hình axios dùng chung cho toàn bộ frontend.
// - Xác định địa chỉ backend (API_URL).
// - Tự gắn JWT vào mọi request để backend nhận diện user.
// CÁCH DÙNG: import axios từ file này (hoặc 'axios' sau khi file đã import 1 lần
// ở App.js) rồi gọi axios.get('/api/classes') như bình thường.
// ============================================================================

// Nạp axios để cấu hình toàn cục.
import axios from 'axios';

// Xác định địa chỉ backend:
// - Nếu deploy fullstack cùng 1 domain Vercel: để trống REACT_APP_API_URL
//   -> dùng đường dẫn tương đối '/api/...' (cùng domain, không lỗi CORS).
// - Nếu backend riêng (Render/Railway...): set REACT_APP_API_URL=https://...backend
//   -> mọi request sẽ gọi sang domain đó.
// .replace(/\/$/, ''): cắt dấu '/' cuối để tránh '//api' lặp slash.
export const API_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

// Nếu có API_URL (backend riêng) thì đặt làm baseURL mặc định cho axios.
if (API_URL) {
  axios.defaults.baseURL = API_URL;
}

// Mặc định mọi request gửi JSON.
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Interceptor (bộ chặn) trước mỗi request:
// - Đọc token trong localStorage (đã lưu lúc login).
// - Nếu có token mà request chưa gắn Authorization thì tự gắn
//   'Bearer <token>' để backend (authMiddleware) xác thực.
// - Nhờ vậy các trang không cần truyền header tay từng lần.
axios.interceptors.request.use((config) => {
  // Lấy JWT đã lưu sau đăng nhập.
  const token = localStorage.getItem('token');
  // Chỉ gắn khi có token và chưa có Authorization (tránh ghi đè).
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Trả config tiếp cho axios thực thi request.
  return config;
});

// Xuất axios đã cấu hình để các file khác import dùng.
export default axios;
