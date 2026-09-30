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
// Nạp useNavigate (chuyển trang sau login) + Link (link sang /register).
import { useNavigate, Link } from 'react-router-dom';
// Nạp axios để gọi API backend.
import axios from 'axios';

// Component trang đăng nhập.
const LoginPage = ({ onLogin }) => {
  // State email: giá trị ô Email.
  const [email, setEmail] = useState('');
  // State password: giá trị ô Mật khẩu.
  const [password, setPassword] = useState('');
  // State error: thông báo lỗi hiện trong hộp đỏ (rỗng = không hiện).
  const [error, setError] = useState('');
  // State loading: true khi đang chờ API (để disable nút, chống bấm 2 lần).
  const [loading, setLoading] = useState(false);
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
      onLogin(response.data.token, response.data.user.role);
      // B3c: Chuyển vào Dashboard.
      navigate('/dashboard');
    } catch (err) {
      // B4a: In lỗi ra console để dev debug.
      console.error('Login error:', err.response || err.message || err);
      // B4b: Không có response = không tới được server (backend chưa chạy / sai URL).
      if (!err.response) {
        setError('Không kết nối được tới server backend. Hãy chắc chắn backend đang chạy.');
      } else {
        // B4c: Có response = server trả lỗi (401 sai MK...), hiện message backend gửi về.
        setError(err.response?.data?.message || `Lỗi đăng nhập (${err.response?.status})`);
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
            <input
              type="password" // ẩn ký tự thành dấu chấm.
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
            />
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
