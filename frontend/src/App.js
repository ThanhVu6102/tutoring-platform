// ============================================================================
// FILE: frontend/src/App.js
// MỤC ĐÍCH: Component gốc của toàn bộ website EKLASSES.
// - Quản lý trạng thái đăng nhập (token + role trong localStorage).
// - Định nghĩa hệ thống Route: /login, /register, /dashboard, /class/:id...
// - Hiển thị Navbar khi đã đăng nhập + nền watermark trang trí.
// ============================================================================

// Nạp React và 2 hook: useState (biến trạng thái) + useEffect (chạy 1 lần khi mở web).
import React, { useState, useEffect } from 'react';
// Nạp các công cụ điều hướng: Router (bao toàn app), Routes/Route (khai báo đường dẫn),
// Navigate (tự chuyển hướng).
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// Nạp CSS chung cho toàn web.
import './styles/App.css';
// Nạp cấu hình axios (tự gắn token vào mọi request). Chỉ cần import để kích hoạt.
import './config/api';

// Nạp các trang (Pages) tương ứng từng đường dẫn.
import LoginPage from './pages/LoginPage'; // trang đăng nhập /login.
import RegisterPage from './pages/RegisterPage'; // trang đăng ký /register.
import Dashboard from './pages/Dashboard'; // trang tổng quan lớp học /dashboard.
import ClassDetail from './pages/ClassDetail'; // trang chi tiết 1 lớp /class/:id.
import QuizTaking from './pages/QuizTaking'; // trang làm bài kiểm tra /quiz/:quizId/take.

// Nạp thanh điều hướng trên cùng.
import Navbar from './components/Navbar';

// Component App: bao toàn bộ website.
const App = () => {
  // State isAuthenticated: true nếu có token trong localStorage (đã đăng nhập).
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  // State userRole: 'student' | 'teacher' | 'admin', dùng để phân quyền hiển thị.
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole'));

  // useEffect chạy 1 lần khi mở web: đồng bộ lại state từ localStorage
  // (phòng khi user F5 hoặc mở tab mới, state React mất nhưng storage còn).
  useEffect(() => {
    // Đọc token đã lưu.
    const token = localStorage.getItem('token');
    // Đọc role đã lưu.
    const role = localStorage.getItem('userRole');
    // Cập nhật state: có token = đã đăng nhập.
    setIsAuthenticated(!!token);
    setUserRole(role);
  }, []); // mảng rỗng = chỉ chạy 1 lần lúc mount.

  // HÀM: handleLogin(token, role) - được LoginPage/RegisterPage gọi sau khi API thành công.
  // - Lưu token + role vào localStorage để giữ đăng nhập.
  // - Cập nhật state để App vẽ lại (hiện Navbar + cho vào /dashboard).
  const handleLogin = (token, role) => {
    localStorage.setItem('token', token); // lưu JWT.
    localStorage.setItem('userRole', role); // lưu vai trò.
    setIsAuthenticated(true); // đánh dấu đã đăng nhập.
    setUserRole(role); // lưu role vào state.
  };

  // HÀM: handleLogout() - được Navbar gọi khi bấm "Đăng xuất".
  // - Xóa sạch token/userRole/userId khỏi localStorage.
  // - Reset state về chưa đăng nhập để App đá về /login.
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    setIsAuthenticated(false);
    setUserRole(null);
  };

  // Mảng ảnh watermark nền trang trí (icon mờ chìm dưới nội dung).
  // Mỗi phần tử gồm src ảnh + class CSS quy định vị trí (wm-1...wm-9).
  const watermarks = [
    { src: '/icon1.png', className: 'wm wm-1' },
    { src: '/icon2.png', className: 'wm wm-2' },
    { src: '/icon3.jpg', className: 'wm wm-3' },
    { src: '/icon1.png', className: 'wm wm-4' },
    { src: '/icon2.png', className: 'wm wm-5' },
    { src: '/icon3.jpg', className: 'wm wm-6' },
    { src: '/icon1.png', className: 'wm wm-7' },
    { src: '/icon2.png', className: 'wm wm-8' },
    { src: '/icon3.jpg', className: 'wm wm-9' },
  ];

  return (
    // Router bao toàn app để dùng điều hướng không tải lại trang.
    <Router>
      <div className="page-shell">
        {/* Lớp nền watermark: vẽ 9 ảnh mờ, aria-hidden để máy đọc màn hình bỏ qua. */}
        <div className="page-watermarks" aria-hidden="true">
          {/* Duyệt mảng watermarks, vẽ mỗi ảnh 1 thẻ img. */}
          {watermarks.map((item, index) => (
            <img key={`${item.src}-${index}`} src={item.src} className={item.className} alt="" />
          ))}
        </div>

        {/* Chỉ hiện Navbar khi đã đăng nhập; truyền role để hiện chữ + nút phù hợp. */}
        {isAuthenticated && <Navbar userRole={userRole} onLogout={handleLogout} />}
        {/* Khai báo các Route của web. */}
        <Routes>
          {/* Trang đăng nhập: truyền handleLogin để lưu token sau khi login API thành công. */}
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          {/* Trang đăng ký: tương tự, đăng ký xong tự đăng nhập luôn. */}
          <Route path="/register" element={<RegisterPage onLogin={handleLogin} />} />

          {/* Nếu ĐÃ đăng nhập thì cho vào các trang cần bảo vệ... */}
          {isAuthenticated ? (
            <>
              {/* Dashboard: truyền userRole để hiện "Tất cả lớp / Lớp của tôi / Lớp đã tham gia". */}
              <Route path="/dashboard" element={<Dashboard userRole={userRole} />} />
              {/* Chi tiết lớp: :id là _id lớp trên URL. */}
              <Route path="/class/:id" element={<ClassDetail />} />
              {/* Làm bài quiz: :quizId là _id đề thi. */}
              <Route path="/quiz/:quizId/take" element={<QuizTaking />} />
              {/* Vào / thì tự đá sang /dashboard. */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </>
          ) : (
            // Nếu CHƯA đăng nhập mà vào bất kỳ đường nào khác thì đá về /login.
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </div>
    </Router>
  );
};

// Xuất App để index.js render ra màn hình.
export default App;
