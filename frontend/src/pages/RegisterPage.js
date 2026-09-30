// ============================================================================
// FILE: frontend/src/pages/RegisterPage.js
// MỤC ĐÍCH: Trang Đăng Ký (/register).
// - Form nhập Họ tên + Email + Vai trò (Học sinh/Giáo viên) + Mật khẩu + Nhập lại.
// - Kiểm tra 2 mật khẩu khớp nhau ở frontend trước khi gọi API.
// - Gọi POST /api/auth/register, thành công thì tự đăng nhập vào /dashboard.
// - Backend chặn đăng ký role 'admin' và email admin gốc nên form chỉ có 2 role.
// PROPS: onLogin(token, role) - hàm của App.js để lưu phiên sau khi đăng ký xong.
// ============================================================================

// Nạp React + useState.
import React, { useState } from 'react';
// Nạp useNavigate (chuyển trang) + Link (về /login).
import { useNavigate, Link } from 'react-router-dom';
// Nạp axios gọi API.
import axios from 'axios';

// Component trang đăng ký.
const RegisterPage = ({ onLogin }) => {
  // State formData: gom 5 ô nhập trong 1 object.
  // - name: họ tên. - email: email. - password + confirmPassword: kiểm tra khớp.
  // - role: 'student' mặc định, chỉ cho chọn student/teacher.
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'student',
  });
  // State error: thông báo lỗi đỏ.
  const [error, setError] = useState('');
  // State loading: chống bấm nút 2 lần khi đang chờ API.
  const [loading, setLoading] = useState(false);
  // Hàm chuyển trang.
  const navigate = useNavigate();

  // HÀM: handleChange - chạy mỗi khi gõ/sửa 1 ô trong form.
  // - Lấy name (tên ô) + value (giá trị mới) từ thẻ input.
  // - Giữ nguyên các ô khác (...prev), chỉ cập nhật ô vừa sửa.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // HÀM: handleSubmit - chạy khi bấm "Đăng Ký".
  // LUỒNG:
  //  - B1: Chặn reload, xóa lỗi cũ.
  //  - B2: So 2 mật khẩu, lệch nhau -> báo lỗi ngay, không gọi API.
  //  - B3: Gọi POST /api/auth/register với {name, email, password, role}.
  //  - B4: Thành công -> lưu userId, gọi onLogin, vào /dashboard.
  //  - B5: Thất bại -> phân biệt mất mạng vs lỗi backend (trùng email...).
  const handleSubmit = async (e) => {
    e.preventDefault(); // B1a: chặn reload form.
    setError(''); // B1b: xóa lỗi cũ.

    // B2: Ràng buộc frontend: mật khẩu nhập lại phải khớp.
    if (formData.password !== formData.confirmPassword) {
      setError('Mật khẩu không trùng khớp');
      return; // dừng, không gọi API.
    }

    setLoading(true); // B3a: bật loading trước khi gọi API.

    try {
      // B3b: Lấy địa chỉ backend.
      const API_URL = process.env.REACT_APP_API_URL || '';
      // B3c: Gọi API đăng ký (không gửi confirmPassword lên server).
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
      });

      // B4a: Lưu _id user mới.
      localStorage.setItem('userId', response.data.user.id);
      // B4b: Báo App lưu token + role (đăng nhập luôn sau đăng ký).
      onLogin(response.data.token, response.data.user.role);
      // B4c: Vào Dashboard.
      navigate('/dashboard');
    } catch (err) {
      // B5a: Log để debug.
      console.error('Register error:', err.response || err.message || err);
      // B5b: Mất mạng (backend chưa chạy / sai REACT_APP_API_URL).
      if (!err.response) {
        setError('Không kết nối được tới server backend. Hãy chắc chắn backend đang chạy (npm run dev trong thư mục backend) hoặc kiểm tra REACT_APP_API_URL.');
      } else {
        // B5c: Lỗi backend (trùng email, email admin gốc...) -> hiện message server.
        setError(err.response?.data?.message || `Lỗi đăng ký (${err.response?.status})`);
      }
    } finally {
      // B6: Tắt loading.
      setLoading(false);
    }
  };

  return (
    // Khung giữa màn hình (dùng chung CSS với Login).
    <div className="auth-container">
      <div className="auth-box">
        {/* Logo. */}
        <div className="auth-brand">
          <img src="/logo1.png" alt="EKLASSES" />
        </div>
        <h2>Đăng Ký Tài Khoản</h2>

        {/* Hộp lỗi đỏ khi có error. */}
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

        {/* Form đăng ký. */}
        <form onSubmit={handleSubmit}>
          {/* Ô họ tên. */}
          <div className="form-group">
            <label>Họ và tên</label>
            <input
              type="text"
              name="name" // khớp key trong formData để handleChange cập nhật đúng.
              value={formData.name}
              onChange={handleChange}
              placeholder="Nhập họ và tên"
              required
            />
          </div>

          {/* Ô email. */}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Nhập email"
              required
            />
          </div>

          {/* Chọn vai trò: chỉ 2 option public, không có admin để chống tự leo quyền. */}
          <div className="form-group">
            <label>Vai trò</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
            >
              <option value="student"> Học sinh</option>
              <option value="teacher"> Giáo viên/Gia sư</option>
            </select>
          </div>

          {/* Ô mật khẩu. */}
          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          {/* Ô nhập lại mật khẩu để xác nhận. */}
          <div className="form-group">
            <label>Xác nhận mật khẩu</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Xác nhận mật khẩu"
              required
            />
          </div>

          {/* Nút đăng ký. */}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Đang đăng ký...' : 'Đăng Ký'}
          </button>
        </form>

        {/* Link về đăng nhập nếu đã có tài khoản. */}
        <div className="auth-link">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </div>
      </div>
    </div>
  );
};

// Xuất trang để App.js gắn vào Route /register.
export default RegisterPage;
