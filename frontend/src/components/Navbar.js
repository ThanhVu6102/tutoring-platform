import React from 'react';
import { useNavigate } from 'react-router-dom';

const Navbar = ({ userRole, onLogout }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="nav-icon-group" aria-hidden="true">
        <div className="nav-decor nav-decor-left">
          <img src="/icon1.png" alt="" />
        </div>
        <div className="nav-decor nav-decor-center">
          <img src="/icon3.jpg" alt="" />
        </div>
        <div className="nav-decor nav-decor-right">
          <img src="/icon2.png" alt="" />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
        <img src="/logo1.png" alt="EKLASSES" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
        <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
          {userRole === 'teacher' ? 'Giáo viên' : 'Học sinh'}
        </p>
      </div>
      <div className="navbar-user" style={{ position: 'relative', zIndex: 1 }}>
        <button onClick={() => navigate('/dashboard')}>Trang chủ</button>
        <button onClick={handleLogout}>Đăng xuất</button>
      </div>
    </nav>
  );
};

export default Navbar;
