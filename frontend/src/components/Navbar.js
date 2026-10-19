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
const Navbar = ({ userRole, onLogout, isAuthenticated }) => {
  // Hàm điều hướng (ví dụ navigate('/dashboard')).
  const navigate = useNavigate();
  const roleLogo = userRole === 'teacher'
    ? '/GiaoVienLogo.png'
    : userRole === 'student'
      ? '/HocSinhLogo.png'
      : '/logo1.png';
  const roleLogoAlt = userRole === 'teacher'
    ? 'EKLASSES Giáo viên'
    : userRole === 'student'
      ? 'EKLASSES Học sinh'
      : 'EKLASSES';

  // HÀM: handleLogout - xử lý khi bấm "Đăng xuất".
  // - B1: Gọi onLogout() của App để xóa token/userRole khỏi storage + state.
  // - B2: Chuyển về trang /login.
  const handleLogout = () => {
    if (!window.confirm('Bạn có chắc chắn muốn đăng xuất phiên này không ?')) return;
    onLogout(); // xóa phiên đăng nhập.
    navigate('/login'); // đá về trang đăng nhập.
  };

  return (
    // Thẻ nav bọc toàn bộ thanh điều hướng (CSS .navbar).
    <nav className="navbar">
      {/* Cụm icon trang trí giữa navbar (chỉ để đẹp, aria-hidden để bỏ qua đọc màn hình). */}
      <div className="nav-icon-group" aria-hidden="true">
        {/* Icon giữa (to hơn). */}
        <div className="nav-decor nav-decor-center">
          <img src="/centerlogo.png" alt="" />
        </div>
      </div>

      {/* Cụm trái: logo + nhãn vai trò. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
        {/* Logo EKLASSES. */}
        <img
          src={isAuthenticated ? roleLogo : '/logo1.png'}
          alt={isAuthenticated ? roleLogoAlt : 'EKLASSES'}
          className={isAuthenticated && ['teacher', 'student'].includes(userRole) ? 'navbar-role-logo' : 'navbar-brand-logo'}
        />
        {/* Hiện tên vai trò theo userRole: admin -> Quản trị viên, teacher -> Giáo viên, còn lại -> Học sinh. */}
        {(!isAuthenticated || userRole === 'admin') && (
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
            {isAuthenticated ? 'ADMIN' : ''}
          </p>
        )}
      </div>
      {/* Cụm phải: 2 nút điều hướng. */}
      <div className="navbar-user" style={{ position: 'relative', zIndex: 1 }}>
        <button onClick={() => navigate('/policies')}>Chính sách</button>
        {isAuthenticated ? (
          <>
            <button onClick={() => navigate(userRole === 'admin' ? '/admin' : '/dashboard')}>
              {userRole === 'admin' ? 'Quản trị lớp' : 'Trang chủ'}
            </button>
            {userRole === 'admin' && <button onClick={() => navigate('/admin/moderation')}>Hồ sơ vi phạm</button>}
            <button onClick={handleLogout}>Đăng xuất</button>
          </>
        ) : (
          <>
            <button onClick={() => navigate('/login')}>Đăng nhập</button>
            <button onClick={() => navigate('/register')}>Đăng ký</button>
          </>
        )}
      </div>
    </nav>
  );
};

// Xuất Navbar để App.js import và hiện khi đã đăng nhập.
export default Navbar;
