// ============================================================================
// FILE: frontend/src/index.js
// MỤC ĐÍCH: Điểm khởi đầu của React - gắn component App vào thẻ #root trong
// file public/index.html để vẽ website lên trình duyệt.
// ============================================================================

// Nạp thư viện React (bắt buộc cho JSX).
import React from 'react';
// Nạp ReactDOM bản client để render vào DOM trình duyệt.
import ReactDOM from 'react-dom/client';
// Nạp CSS chung toàn web.
import './styles/App.css';
// Nạp component gốc App (chứa toàn bộ Route + Navbar + Pages).
import App from './App';

// Tìm thẻ <div id="root"> trong index.html rồi tạo root render React.
const root = ReactDOM.createRoot(document.getElementById('root'));
// Vẽ App vào root, bọc StrictMode để React cảnh báo lỗi tiềm ẩn khi dev.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
