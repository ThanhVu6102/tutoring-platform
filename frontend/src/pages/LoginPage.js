// ============================================================================
// FILE: frontend/src/pages/LoginPage.js
// MỤC ĐÍCH: Trang Đăng Nhập (/login).
// - Form nhập Email + Mật khẩu, gọi POST /api/auth/login.
// - Thành công: lưu userId, gọi onLogin(token, role) của App rồi vào /dashboard.
// - Thất bại: hiện hộp lỗi đỏ (sai TK/MK hoặc mất kết nối backend).
// - Tài khoản admin mặc định: admin@eklasses.vn / Admin123! (do backend quy định).
// PROPS: onLogin(token, role) - hàm của App.js để lưu phiên đăng nhập.
// ============================================================================

// Nạp React + hook useState (lưu giá trị form, lỗi, trạng thái tải).
import React, { useState } from 'react';
// Nạp useNavigate (chuyển trang sau login) + Link (link sang /register)
// + useLocation (đọc thông báo truyền từ trang đăng ký nếu có).
import { useNavigate, Link, useLocation } from 'react-router-dom';
// Nạp axios để gọi API backend.
import axios from 'axios';
import { policyReasonLabels } from '../config/policyLabels';

// Component trang đăng nhập.
const LoginPage = ({ onLogin }) => {
  // State email: giá trị ô Email.
  const [email, setEmail] = useState('');
  // State password: giá trị ô Mật khẩu.
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // State error: thông báo lỗi hiện trong hộp đỏ (rỗng = không hiện).
  const [error, setError] = useState('');
  const [restrictionNotice, setRestrictionNotice] = useState(null);
  // State loading: true khi đang chờ API (để disable nút, chống bấm 2 lần).
  const [loading, setLoading] = useState(false);
  // Đọc state được navigate('/login', { state: {...} }) gắn kèm từ RegisterPage.
  const locationState = useLocation().state;
  // State notice: thông báo xanh (ví dụ "đăng ký xong, chờ duyệt" từ RegisterPage).
  const [notice, setNotice] = useState(
    locationState?.notice ? String(locationState.notice) : ''
  );
  // Xóa notice sau khi đăng nhập thành công (tránh hiện lại khi quay về login).
  const clearNotice = () => setNotice('');
  // Hàm chuyển trang.
  const navigate = useNavigate();

  // HÀM: handleSubmit - chạy khi bấm nút "Đăng Nhập".
  // LUỒNG:
  //  - B1: Chặn reload form, xóa lỗi cũ, bật loading.
  //  - B2: Gọi POST /api/auth/login với {email, password}.
  //  - B3: Thành công -> lưu userId, gọi onLogin để App lưu token/role, vào /dashboard.
  //  - B4: Thất bại -> phân biệt mất mạng (không có response) vs sai TK/MK (có response).
  //  - B5: Tắt loading.
  const handleSubmit = async (e) => {
    e.preventDefault(); // B1a: chặn trình duyệt tải lại trang khi submit form.
    setError(''); // B1b: xóa lỗi cũ.
    setRestrictionNotice(null);
    setLoading(true); // B1c: bật trạng thái đang tải.

    try {
      // B2a: Lấy địa chỉ backend từ env (rỗng = cùng domain).
      const API_URL = process.env.REACT_APP_API_URL || '';
      // B2b: Gọi API đăng nhập của backend.
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      });

      // B3a: Lưu _id user để các trang khác dùng (ví dụ nộp bài cần student id).
      localStorage.setItem('userId', response.data.user.id);
      // B3b: Báo cho App lưu token + role (App sẽ hiện Navbar + cho vào route bảo vệ).
      clearNotice();
      onLogin(response.data.token, response.data.user.role);
      // B3c: Chuyển vào Dashboard.
      navigate(response.data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      // B4a: In lỗi ra console để dev debug.
      console.error('Login error:', err.response || err.message || err);
      // B4b: Không có response = không tới được server (backend chưa chạy / sai URL).
      if (!err.response) {
        setError('Không kết nối được tới server backend. Hãy chắc chắn backend đang chạy.');
      } else {
        // B4c: Có response = server trả lỗi (401 sai MK...), hiện message backend gửi về.
        setError(err.response?.data?.message || `Lỗi đăng nhập (${err.response?.status})`);
        setRestrictionNotice(err.response?.data?.restriction
          ? { ...err.response.data.restriction, suspendedUntil: err.response.data.suspendedUntil }
          : null);
      }
    } finally {
      // B5: Dù thành công hay lỗi cũng tắt loading để bấm lại được.
      setLoading(false);
    }
  };

  return (
    // Khung giữa màn hình cho form đăng nhập (CSS .auth-container).
    <div className="auth-container">
      {/* Hộp trắng chứa form (CSS .auth-box). */}
      <div className="auth-box">
        {/* Logo EKLASSES trên cùng. */}
        <div className="auth-brand">
          <img src="/logo1.png" alt="EKLASSES" />
        </div>
        {/* Tiêu đề trang. */}
        <h2>Đăng Nhập</h2>

        {/* Hộp thông báo xanh: notice từ RegisterPage (đăng ký xong, chờ duyệt). */}
        {notice && (
          <div style={{
            padding: '1rem',
            background: '#D5F5E3',
            color: '#1E8449',
            borderRadius: '5px',
            marginBottom: '1rem'
          }}>
            {notice}
          </div>
        )}

        {/* Hộp báo lỗi đỏ: chỉ hiện khi error khác rỗng. */}
        {error && (
          <div style={{
            padding: '1rem',
            background: '#FADBD8',
            color: '#C0392B',
            borderRadius: '5px',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}
        {restrictionNotice && (
          <div className="login-restriction-notice" role="alert">
            <strong>{restrictionNotice.sanction}</strong>
            {restrictionNotice.className && <p>Lớp: {restrictionNotice.className}</p>}
            {restrictionNotice.reasonCode && <p>Quy định: {policyReasonLabels[restrictionNotice.reasonCode] || restrictionNotice.reasonCode}</p>}
            {restrictionNotice.details && <p>Chi tiết: {restrictionNotice.details}</p>}
            {restrictionNotice.suspendedUntil && <p>Thời hạn đến: {new Date(restrictionNotice.suspendedUntil).toLocaleString('vi-VN')}</p>}
            <p>Nếu cần trao đổi về quyết định, liên hệ <a href="mailto:admin@eklasses.vn">admin@eklasses.vn</a>.</p>
          </div>
        )}

        {/* Form đăng nhập, submit gọi handleSubmit ở trên. */}
        <form onSubmit={handleSubmit}>
          {/* Ô nhập Email. */}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email" // kiểm tra định dạng email tự động.
              value={email} // giá trị từ state.
              onChange={(e) => setEmail(e.target.value)} // gõ -> cập nhật state.
              placeholder="Nhập email của bạn"
              required // bắt buộc nhập.
            />
          </div>

          {/* Ô nhập Mật khẩu. */}
          <div className="form-group">
            <label>Mật khẩu</label>
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                required
              />
              <button
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="password-visibility-button"
                onClick={() => setShowPassword((visible) => !visible)}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                type="button"
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>

          {/* Nút submit: disable khi loading để chống spam. */}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {/* Đổi chữ nút theo trạng thái. */}
            {loading ? 'Đang đăng nhập...' : 'Đăng Nhập'}
          </button>
        </form>

        {/* Link sang trang đăng ký nếu chưa có tài khoản. */}
        <div className="auth-link">
          Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
        </div>
      </div>
    </div>
  );
};

// Xuất trang để App.js gắn vào Route /login.
export default LoginPage;
