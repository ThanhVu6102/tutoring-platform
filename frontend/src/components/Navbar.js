import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import NotificationsBell from './NotificationsBell';

// Thanh điều hướng dùng cùng một luồng cho desktop và menu thu gọn trên mobile.
const Navbar = ({ userRole, onLogout, isAuthenticated }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const home = userRole === 'admin' ? '/admin' : '/dashboard';
  const roleLogo = userRole === 'teacher' ? '/GiaoVienLogo.png' : userRole === 'student' ? '/HocSinhLogo.png' : '/logo1.png';

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!isAuthenticated || !['student', 'teacher'].includes(userRole)) {
      setProfile(null);
      return undefined;
    }
    let active = true;
    const loadProfile = () => axios.get('/api/users/profile')
      .then(({ data }) => { if (active) { setProfile(data); setAvatarFailed(false); } })
      .catch(() => { if (active) setProfile(null); });
    loadProfile();
    window.addEventListener('eklasses:profile-updated', loadProfile);
    return () => { active = false; window.removeEventListener('eklasses:profile-updated', loadProfile); };
  }, [isAuthenticated, userRole]);

  const go = (path) => { setMenuOpen(false); navigate(path); };
  const handleLogout = () => {
    if (!window.confirm('Bạn có chắc chắn muốn đăng xuất phiên này không?')) return;
    setMenuOpen(false);
    onLogout();
    navigate('/login');
  };
  const firstLetter = (profile?.name || '?').trim().charAt(0).toLocaleUpperCase('vi-VN') || '?';

  return (
    <nav className="navbar" aria-label="Điều hướng chính">
      <div className="nav-icon-group" aria-hidden="true"><div className="nav-decor nav-decor-center"><img src="/centerlogo.png" alt="" /></div></div>
      <div className="navbar-brand">
        <img src={isAuthenticated ? roleLogo : '/logo1.png'} alt="EKLASSES" className={isAuthenticated && ['teacher', 'student'].includes(userRole) ? 'navbar-role-logo' : 'navbar-brand-logo'} />
        {isAuthenticated && userRole === 'admin' && <span className="navbar-role-label">ADMIN</span>}
        {isAuthenticated && ['student', 'teacher'].includes(userRole) && (
          <button className="navbar-avatar" type="button" aria-label="Mở hồ sơ cá nhân" onClick={() => go('/profile')}>
            {profile?.avatar && !avatarFailed ? <img src={profile.avatar} alt="" onError={() => setAvatarFailed(true)} /> : <span aria-hidden="true">{firstLetter}</span>}
          </button>
        )}
      </div>
      <button className="navbar-menu-toggle" type="button" aria-label={menuOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'} aria-expanded={menuOpen} aria-controls="navbar-actions" onClick={() => setMenuOpen((value) => !value)}>
        <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
      </button>
      <div id="navbar-actions" className={`navbar-user${menuOpen ? ' is-open' : ''}`}>
        <button type="button" onClick={() => go('/policies')}>Chính sách</button>
        {isAuthenticated ? <>
          {['student', 'teacher'].includes(userRole) && <NotificationsBell userRole={userRole} pathname={location.pathname} />}
          {['student', 'teacher'].includes(userRole) && <button type="button" onClick={() => go('/appeals')}>Kháng cáo</button>}
          <button type="button" onClick={() => go(home)}>{userRole === 'admin' ? 'Quản trị lớp' : 'Trang chủ'}</button>
          {userRole === 'admin' && <button type="button" onClick={() => go('/admin/moderation')}>Hồ sơ vi phạm</button>}
          <button type="button" onClick={handleLogout}>Đăng xuất</button>
        </> : <>
          <button type="button" onClick={() => go('/login')}>Đăng nhập</button>
          <button type="button" onClick={() => go('/register')}>Đăng ký</button>
        </>}
      </div>
    </nav>
  );
};

export default Navbar;
