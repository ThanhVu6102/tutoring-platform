// ============================================================================
// FILE: frontend/src/components/Navbar.js
// MỤC ĐÍCH: Thanh điều hướng trên cùng, hiện sau khi đăng nhập.
// - Hiện logo EKLASSES + tên vai trò (Quản trị viên / Giáo viên / Học sinh).
// - 2 nút: "Trang chủ" (về /dashboard) và "Đăng xuất".
// PROPS: userRole (vai trò hiện tại), onLogout (hàm xóa token ở App.js).
// ============================================================================

// Nạp React.
import React from 'react';
// Nạp hook useNavigate để chuyển trang bằng code (không cần thẻ Link).
import { useNavigate } from 'react-router-dom';

// Component Navbar nhận 2 props từ App.js.
const Navbar = ({ userRole, onLogout }) => {
  // Hàm điều hướng (ví dụ navigate('/dashboard')).
  const navigate = useNavigate();

  // HÀM: handleLogout - xử lý khi bấm "Đăng xuất".
  // - B1: Gọi onLogout() của App để xóa token/userRole khỏi storage + state.
  // - B2: Chuyển về trang /login.
  const handleLogout = () => {
    onLogout(); // xóa phiên đăng nhập.
    navigate('/login'); // đá về trang đăng nhập.
  };

  return (
    // Thẻ nav bọc toàn bộ thanh điều hướng (CSS .navbar).
    <nav className="navbar">
      {/* Cụm icon trang trí giữa navbar (chỉ để đẹp, aria-hidden để bỏ qua đọc màn hình). */}
      <div className="nav-icon-group" aria-hidden="true">
        {/* Icon trái. */}
        <div className="nav-decor nav-decor-left">
          <img src="/icon1.png" alt="" />
        </div>
        {/* Icon giữa (to hơn). */}
        <div className="nav-decor nav-decor-center">
          <img src="/icon3.jpg" alt="" />
        </div>
        {/* Icon phải. */}
        <div className="nav-decor nav-decor-right">
          <img src="/icon2.png" alt="" />
        </div>
      </div>

      {/* Cụm trái: logo + nhãn vai trò. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
        {/* Logo EKLASSES. */}
        <img src="/logo1.png" alt="EKLASSES" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
        {/* Hiện tên vai trò theo userRole: admin -> Quản trị viên, teacher -> Giáo viên, còn lại -> Học sinh. */}
        <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
          {userRole === 'admin' ? 'Quản trị viên' : userRole === 'teacher' ? 'Giáo viên' : 'Học sinh'}
        </p>
      </div>
      {/* Cụm phải: 2 nút điều hướng. */}
      <div className="navbar-user" style={{ position: 'relative', zIndex: 1 }}>
        {/* Nút về Dashboard. */}
        <button onClick={() => navigate('/dashboard')}>Trang chủ</button>
        {/* Nút đăng xuất, gọi handleLogout ở trên. */}
        <button onClick={handleLogout}>Đăng xuất</button>
      </div>
    </nav>
  );
};

// Xuất Navbar để App.js import và hiện khi đã đăng nhập.
export default Navbar;
