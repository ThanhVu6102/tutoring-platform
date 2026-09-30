// ============================================================================
// FILE: frontend/src/pages/Dashboard.js
// MỤC ĐÍCH: Trang tổng quan sau đăng nhập (/dashboard).
// - Hiện danh sách lớp: admin thấy TẤT CẢ, teacher thấy lớp mình dạy,
//   student thấy lớp đã tham gia (backend đã lọc, frontend chỉ hiển thị).
// - Teacher/admin có nút + form "Tạo Lớp Học Mới".
// - Mỗi thẻ lớp có nút "Vào Lớp →" sang /class/:id.
// PROPS: userRole ('admin' | 'teacher' | 'student') để phân quyền hiển thị.
// ============================================================================

// Nạp React + hook useState (dữ liệu) + useEffect (tải lớp khi mở trang).
import React, { useState, useEffect } from 'react';
// Nạp useNavigate để sang trang chi tiết lớp.
import { useNavigate } from 'react-router-dom';
// Nạp axios gọi API backend.
import axios from 'axios';

// Component Dashboard.
const Dashboard = ({ userRole }) => {
  // State classes: mảng lớp lấy từ GET /api/classes.
  const [classes, setClasses] = useState([]);
  // State activeTab: 'classes' (xem lưới lớp) | 'create' (hiện form tạo lớp).
  const [activeTab, setActiveTab] = useState('classes');
  // State newClass: 4 ô của form tạo lớp.
  const [newClass, setNewClass] = useState({
    name: '',
    description: '',
    subject: '',
    grade: '',
  });
  // State loading: chống bấm "Tạo Lớp" 2 lần.
  const [loading, setLoading] = useState(false);
  // Hàm chuyển trang.
  const navigate = useNavigate();

  // useEffect: tự tải danh sách lớp 1 lần khi mở Dashboard.
  useEffect(() => {
    fetchClasses();
  }, []); // mảng rỗng = chỉ chạy lúc mount.

  // HÀM: fetchClasses - lấy danh sách lớp từ backend.
  // - Lấy token trong localStorage để gắn Authorization.
  // - GET /api/classes (interceptor ở config/api cũng tự gắn, ở đây gắn tay thêm).
  // - Lưu kết quả vào state classes để vẽ lưới thẻ.
  const fetchClasses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/classes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClasses(response.data); // cập nhật lưới lớp.
    } catch (error) {
      // Lỗi (hết token, mất mạng) thì log để debug, giữ danh sách cũ.
      console.error('Error fetching classes:', error);
    }
  };

  // HÀM: handleCreateClass - tạo lớp mới khi submit form.
  // LUỒNG:
  //  - B1: Chặn reload, bật loading.
  //  - B2: POST /api/classes với {name, description, subject, grade}.
  //  - B3: Xóa trắng form, tải lại danh sách, quay về tab xem lớp.
  const handleCreateClass = async (e) => {
    e.preventDefault(); // B1a: chặn reload.
    setLoading(true); // B1b: bật loading.

    try {
      const token = localStorage.getItem('token');
      // B2: Gọi API tạo lớp (backend gán teacher = người tạo).
      await axios.post('/api/classes', newClass, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // B3a: Reset form về rỗng.
      setNewClass({ name: '', description: '', subject: '', grade: '' });
      // B3b: Tải lại để lớp mới hiện ngay.
      fetchClasses();
      // B3c: Đóng form, về tab danh sách.
      setActiveTab('classes');
    } catch (error) {
      console.error('Error creating class:', error);
    } finally {
      setLoading(false); // tắt loading.
    }
  };

  return (
    // Khung nội dung chính (CSS .main-content).
    <div className="main-content">
      {/* Tiêu đề thay đổi theo role: admin xem tất cả, teacher xem lớp mình, student xem lớp đã join. */}
      <div className="section-header">
        <h2> {userRole === 'admin' ? 'Tất Cả Lớp Học' : userRole === 'teacher' ? 'Lớp Học Của Tôi' : 'Lớp Học Đã Tham Gia'}</h2>
      </div>

      {/* Nút mở/đóng form tạo lớp: chỉ teacher + admin thấy. */}
      {(userRole === 'teacher' || userRole === 'admin') && (
        <div style={{ marginBottom: '2rem' }}>
          <button
            className="btn btn-primary"
            // Bấm thì đảo tab: đang xem -> mở form, đang mở -> đóng lại.
            onClick={() => setActiveTab(activeTab === 'create' ? 'classes' : 'create')}
          >
            {activeTab === 'create' ? '✕ Đóng' : '+ Tạo Lớp Học Mới'}
          </button>
        </div>
      )}

      {/* Form tạo lớp: chỉ hiện khi activeTab === 'create' và là teacher/admin. */}
      {activeTab === 'create' && (userRole === 'teacher' || userRole === 'admin') && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3>Tạo Lớp Học Mới</h3>
          <form onSubmit={handleCreateClass}>
            {/* Ô tên lớp (bắt buộc). */}
            <div className="form-group">
              <label>Tên lớp học</label>
              <input
                type="text"
                value={newClass.name}
                // Gõ -> giữ nguyên 3 ô còn lại, chỉ đổi name.
                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                placeholder="VD: Toán lớp 10"
                required
              />
            </div>

            {/* Ô mô tả (không bắt buộc). */}
            <div className="form-group">
              <label>Mô tả</label>
              <textarea
                value={newClass.description}
                onChange={(e) => setNewClass({ ...newClass, description: e.target.value })}
                placeholder="Mô tả về lớp học"
                rows="3"
              />
            </div>

            {/* 2 ô cạnh nhau: môn học (bắt buộc) + khối lớp. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Môn học</label>
                <input
                  type="text"
                  value={newClass.subject}
                  onChange={(e) => setNewClass({ ...newClass, subject: e.target.value })}
                  placeholder="VD: Toán"
                  required
                />
              </div>

              <div className="form-group">
                <label>Khối lớp</label>
                <input
                  type="text"
                  value={newClass.grade}
                  onChange={(e) => setNewClass({ ...newClass, grade: e.target.value })}
                  placeholder="VD: Lớp 10"
                />
              </div>
            </div>

            {/* Nút tạo lớp. */}
            <button
              type="submit"
              className="btn btn-success"
              disabled={loading}
            >
              {loading ? 'Đang tạo...' : 'Tạo Lớp Học'}
            </button>
          </form>
        </div>
      )}

      {/* Lưới thẻ lớp học (CSS .grid.grid-2). */}
      <div className="grid grid-2">
        {/* Nếu có lớp thì vẽ mỗi lớp 1 thẻ card... */}
        {classes.length > 0 ? (
          classes.map(cls => (
            <div key={cls._id} className="card card-yellow">
              {/* Tên lớp. */}
              <h3 style={{ color: '#E63946', marginBottom: '0.5rem' }}>{cls.name}</h3>
              {/* Mô tả lớp. */}
              <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                {cls.description}
              </p>
              {/* Huy hiệu môn + khối. */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {/* Huy hiệu môn học (nền đỏ). */}
                <span style={{
                  background: '#E63946',
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem'
                }}>
                  {cls.subject}
                </span>
                {/* Huy hiệu khối: chỉ hiện nếu có grade. */}
                {cls.grade && (
                  <span style={{
                    background: '#F4D35E',
                    color: '#333',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem'
                  }}>
                    {cls.grade}
                  </span>
                )}
              </div>
              {/* Số học sinh trong lớp (?. để không crash khi chưa populate). */}
              <div style={{
                fontSize: '0.9rem',
                color: '#666',
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid #eee'
              }}>
                <strong>Học sinh:</strong> {cls.students?.length || 0}
              </div>
              {/* Nút vào chi tiết lớp /class/<id>. */}
              <button
                className="btn btn-primary btn-block"
                onClick={() => navigate(`/class/${cls._id}`)}
              >
                Vào Lớp →
              </button>
            </div>
          ))
        ) : (
          // Nếu chưa có lớp nào thì hiện hộp trống với câu khác nhau theo role.
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center' }}>
            <p style={{ color: '#999' }}>
              {(userRole === 'teacher' || userRole === 'admin') ? 'Bạn chưa có lớp học nào. Hãy tạo lớp mới!' : 'Bạn chưa tham gia lớp học nào'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Xuất Dashboard để App.js gắn vào Route /dashboard.
export default Dashboard;
