// ============================================================================
// FILE: frontend/src/pages/ClassDetail.js
// MỤC ĐÍCH: Trang chi tiết 1 lớp học (/class/:id) với 7 tab.
// - Tab Tổng Quan: thống kê số học sinh/video/tài liệu/quiz/bài tập + info lớp.
// - Tab Video/Tài liệu/Quiz/Bài tập: lưới thẻ học liệu của lớp.
// - Tab Thông Báo: xem + (teacher) đăng thông báo theo độ ưu tiên.
// - Tab Học Sinh (teacher): form thêm học sinh bằng email + bảng danh sách.
// - Mọi API đều gắn JWT; id lớp lấy từ URL.
// ============================================================================

// Nạp React + hook useState/useEffect.
import React, { useState, useEffect } from 'react';
// Nạp useParams để lấy :id lớp trên URL.
import { useParams } from 'react-router-dom';
// Nạp axios gọi API.
import axios from 'axios';

// Component chi tiết lớp.
const ClassDetail = () => {
  // Lấy id lớp từ URL /class/:id.
  const { id } = useParams();
  // State classData: thông tin lớp (null = đang tải).
  const [classData, setClassData] = useState(null);
  // State activeTab: tab đang mở ('overview' mặc định).
  const [activeTab, setActiveTab] = useState('overview');
  // Các state mảng học liệu của lớp.
  const [videos, setVideos] = useState([]); // video bài giảng.
  const [documents, setDocuments] = useState([]); // tài liệu.
  const [quizzes, setQuizzes] = useState([]); // đề kiểm tra.
  const [assignments, setAssignments] = useState([]); // bài tập.
  const [announcements, setAnnouncements] = useState([]); // thông báo.
  // State userRole: đọc 1 lần từ localStorage để phân quyền nút teacher.
  const [userRole] = useState(localStorage.getItem('userRole'));  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '', priority: 'normal' });
  // State newAnnouncement: form đăng thông báo {title, content, priority}.
  // State studentEmail: ô nhập email khi thêm học sinh.
  const [studentEmail, setStudentEmail] = useState('');

  // useEffect: khi id lớp đổi thì tải lại toàn bộ dữ liệu 6 loại.
  useEffect(() => {
    fetchClassDetails(); // thông tin lớp + danh sách học sinh.
    fetchVideos(); // video của lớp.
    fetchDocuments(); // tài liệu của lớp.
    fetchQuizzes(); // quiz của lớp.
    fetchAssignments(); // bài tập của lớp.
    fetchAnnouncements(); // thông báo của lớp.
  }, [id]);

  // Lấy token 1 lần để gắn vào mọi request bên dưới.
  const token = localStorage.getItem('token');

  // HÀM: fetchClassDetails - GET /api/classes/:id -> lưu vào classData.
  const fetchClassDetails = async () => {
    try {
      const response = await axios.get(`/api/classes/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClassData(response.data);
    } catch (error) {
      console.error('Error fetching class:', error);
    }
  };

  // HÀM: fetchVideos - GET /api/videos/class/:id -> lưu vào videos.
  const fetchVideos = async () => {
    try {
      const response = await axios.get(`/api/videos/class/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVideos(response.data);
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
  };

  // HÀM: fetchDocuments - GET /api/documents/class/:id -> lưu vào documents.
  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`/api/documents/class/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  // HÀM: fetchQuizzes - GET /api/quizzes/class/:id -> lưu vào quizzes.
  const fetchQuizzes = async () => {
    try {
      const response = await axios.get(`/api/quizzes/class/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuizzes(response.data);
    } catch (error) {
      console.error('Error fetching quizzes:', error);
    }
  };

  // HÀM: fetchAssignments - GET /api/assignments/class/:id -> lưu vào assignments.
  const fetchAssignments = async () => {
    try {
      const response = await axios.get(`/api/assignments/class/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAssignments(response.data);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  // HÀM: fetchAnnouncements - GET /api/announcements/class/:id -> lưu vào announcements.
  const fetchAnnouncements = async () => {
    try {
      const response = await axios.get(`/api/announcements/class/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnnouncements(response.data);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  // HÀM: handleEnrollStudent - thêm học sinh vào lớp bằng email.
  // - POST /api/classes/:id/enroll với {studentEmail}.
  // - Xong thì xóa ô nhập, tải lại info lớp, báo thành công.
  const handleEnrollStudent = async (e) => {
    e.preventDefault(); // chặn reload form.
    try {
      await axios.post(`/api/classes/${id}/enroll`,
        { studentEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStudentEmail(''); // xóa ô nhập.
      fetchClassDetails(); // tải lại để bảng học sinh có người mới.
      alert('Học sinh được thêm thành công');
    } catch (error) {
      // Hiện message backend (trùng, quá sĩ số, không tìm thấy email...).
      alert(error.response?.data?.message || 'Lỗi khi thêm học sinh');
    }
  };

  // HÀM: handlePostAnnouncement - đăng thông báo mới cho lớp.
  // - POST /api/announcements với {...form, classId: id}.
  // - Xong thì reset form, tải lại danh sách.
  const handlePostAnnouncement = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/announcements',
        { ...newAnnouncement, classId: id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewAnnouncement({ title: '', content: '', priority: 'normal' }); // reset form.
      fetchAnnouncements(); // tải lại để thông báo mới hiện ngay.
      alert('Thông báo đã được đăng');
    } catch (error) {
      alert('Lỗi khi đăng thông báo');
    }
  };

  // Khi chưa tải xong lớp thì hiện chữ chờ (tránh crash khi classData null).
  if (!classData) {
    return <div className="main-content"><p>Đang tải...</p></div>;
  }

  return (
    <div className="main-content">
      {/* Đầu trang: tên + mô tả lớp. */}
      <div className="section-header">
        <h2>{classData.name}</h2>
        <p>{classData.description}</p>
      </div>

      {/* Thanh Tabs: 7 nút chuyển activeTab, nút active tô đỏ. */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2rem',
        borderBottom: '2px solid #eee',
        paddingBottom: '1rem',
        flexWrap: 'wrap'
      }}>
        {/* Duyệt mảng tên tab, vẽ mỗi tab 1 nút. */}
        {['overview', 'videos', 'documents', 'quizzes', 'assignments', 'announcements', 'students'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)} // bấm -> đổi tab hiển thị.
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              background: activeTab === tab ? '#E63946' : 'transparent', // active nền đỏ.
              color: activeTab === tab ? 'white' : '#333',
              cursor: 'pointer',
              borderRadius: '5px 5px 0 0',
              fontWeight: 600,
              transition: 'all 0.3s'
            }}
          >
            {/* Nhãn tiếng Việt cho từng tab. */}
            {tab === 'overview' && 'Tổng Quan'}
            {tab === 'videos' && 'Video'}
            {tab === 'documents' && 'Tài Liệu'}
            {tab === 'quizzes' && 'Kiểm Tra'}
            {tab === 'assignments' && 'Bài Tập'}
            {tab === 'announcements' && 'Thông Báo'}
            {tab === 'students' && 'Học Sinh'}
          </button>
        ))}
      </div>

      {/* TAB Tổng Quan: 2 thẻ Thống Kê + Thông Tin Lớp. */}
      {activeTab === 'overview' && (
        <div className="grid grid-2">
          {/* Thẻ thống kê số lượng học liệu (lấy từ length các mảng). */}
          <div className="card">
            <h3>Thống Kê</h3>
            <div style={{ marginTop: '1rem' }}>
              <p><strong>Tổng học sinh:</strong> {classData.students?.length || 0}</p>
              <p><strong>Video bài giảng:</strong> {videos.length}</p>
              <p><strong>Tài liệu:</strong> {documents.length}</p>
              <p><strong>Bài kiểm tra:</strong> {quizzes.length}</p>
              <p><strong>Bài tập:</strong> {assignments.length}</p>
            </div>
          </div>

          {/* Thẻ thông tin cố định của lớp. */}
          <div className="card card-yellow">
            <h3>Thông Tin Lớp</h3>
            <p><strong>Môn học:</strong> {classData.subject}</p>
            <p><strong>Khối lớp:</strong> {classData.grade || 'N/A'}</p>
            <p><strong>Sức chứa:</strong> {classData.capacity} học sinh</p>
            <p><strong>Trạng thái:</strong> <span style={{ color: '#2ECC71' }}>● Hoạt động</span></p>
          </div>
        </div>
      )}

      {/* TAB Video: lưới thẻ video (tiêu đề, mô tả, views, thời lượng). */}
      {activeTab === 'videos' && (
        <div>
          <div className="grid grid-2">
            {videos.length > 0 ? (
              videos.map(video => (
                <div key={video._id} className="card">
                  <h3>{video.title}</h3>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                    {video.description}
                  </p>
                  {/* Khung giả video player (hiện placeholder, chưa nhúng player thật). */}
                  <div style={{
                    background: '#F0F0F0',
                    padding: '1rem',
                    borderRadius: '5px',
                    marginBottom: '1rem',
                    textAlign: 'center',
                    minHeight: '100px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <p style={{ color: '#999' }}>Video Player</p>
                  </div>
                  {/* Lượt xem + thời lượng (giây -> phút). */}
                  <small style={{ display: 'block', marginBottom: '1rem', color: '#666' }}>
                    {video.views} lượt xem | {Math.floor(video.duration / 60)} phút
                  </small>
                  <button className="btn btn-primary btn-block">
                    Xem Video
                  </button>
                </div>
              ))
            ) : (
              // Trống thì hiện câu báo.
              <div className="card" style={{ gridColumn: '1/-1' }}>
                <p style={{ color: '#999', textAlign: 'center' }}>Chưa có video bài giảng</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB Tài liệu: lưới thẻ doc (tiêu đề, lượt tải, loại file). */}
      {activeTab === 'documents' && (
        <div>
          <div className="grid">
            {documents.length > 0 ? (
              documents.map(doc => (
                <div key={doc._id} className="card">
                  <h3>{doc.title}</h3>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                    {doc.description}
                  </p>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #eee',
                    paddingTop: '1rem'
                  }}>
                    <small style={{ color: '#666' }}>
                      {doc.downloads} lượt tải | {doc.fileType.toUpperCase()}
                    </small>
                    <button className="btn btn-secondary">Tải</button>
                  </div>
                </div>
              ))
            ) : (
              <div className="card" style={{ gridColumn: '1/-1' }}>
                <p style={{ color: '#999', textAlign: 'center' }}>Chưa có tài liệu</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB Kiểm tra: lưới thẻ quiz (số câu, tổng điểm, giới hạn giờ). */}
      {activeTab === 'quizzes' && (
        <div>
          <div className="grid">
            {quizzes.length > 0 ? (
              quizzes.map(quiz => (
                <div key={quiz._id} className="card">
                  <h3>{quiz.title}</h3>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                    {quiz.description}
                  </p>
                  <div style={{ marginBottom: '1rem' }}>
                    <small style={{ display: 'block', color: '#666', marginBottom: '0.5rem' }}>
                      {quiz.questions.length} câu hỏi | {quiz.totalPoints} điểm
                    </small>
                    {/* Chỉ hiện giới hạn giờ nếu đề có timeLimit. */}
                    {quiz.timeLimit && (
                      <small style={{ display: 'block', color: '#666' }}>
                        Giới hạn: {quiz.timeLimit} phút
                      </small>
                    )}
                  </div>
                  {/* Teacher xem chi tiết, học sinh bấm làm bài (hiện chỉ là nhãn, chưa gắn link). */}
                  <button className="btn btn-primary btn-block">
                    {userRole === 'teacher' ? 'Xem Chi Tiết' : 'Làm Bài'}
                  </button>
                </div>
              ))
            ) : (
              <div className="card" style={{ gridColumn: '1/-1' }}>
                <p style={{ color: '#999', textAlign: 'center' }}>Chưa có bài kiểm tra</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB Bài tập: lưới thẻ assignment (tổng điểm, hạn nộp vi-VN). */}
      {activeTab === 'assignments' && (
        <div>
          <div className="grid">
            {assignments.length > 0 ? (
              assignments.map(assign => (
                <div key={assign._id} className="card">
                  <h3>{assign.title}</h3>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                    {assign.description}
                  </p>
                  <div style={{ marginBottom: '1rem' }}>
                    <small style={{ display: 'block', color: '#666', marginBottom: '0.5rem' }}>
                      {assign.totalPoints} điểm
                    </small>
                    {/* Định dạng hạn nộp theo ngày Việt Nam. */}
                    <small style={{ display: 'block', color: '#E63946' }}>
                      Hạn: {new Date(assign.dueDate).toLocaleDateString('vi-VN')}
                    </small>
                  </div>
                  <button className="btn btn-primary btn-block">
                    {userRole === 'teacher' ? 'Xem Nộp Bài' : 'Nộp Bài'}
                  </button>
                </div>
              ))
            ) : (
              <div className="card" style={{ gridColumn: '1/-1' }}>
                <p style={{ color: '#999', textAlign: 'center' }}>Chưa có bài tập</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB Thông báo: form đăng (teacher) + danh sách thông báo. */}
      {activeTab === 'announcements' && (
        <div>
          {/* Form đăng: chỉ teacher thấy. */}
          {userRole === 'teacher' && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h3>Đăng Thông Báo</h3>
              <form onSubmit={handlePostAnnouncement}>
                {/* Ô tiêu đề. */}
                <div className="form-group">
                  <label>Tiêu đề</label>
                  <input
                    type="text"
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                    placeholder="Tiêu đề thông báo"
                    required
                  />
                </div>

                {/* Ô nội dung. */}
                <div className="form-group">
                  <label>Nội dung</label>
                  <textarea
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                    placeholder="Nội dung thông báo"
                    rows="3"
                    required
                  />
                </div>

                {/* Chọn độ ưu tiên low/normal/high. */}
                <div className="form-group">
                  <label>Độ ưu tiên</label>
                  <select
                    value={newAnnouncement.priority}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, priority: e.target.value })}
                  >
                    <option value="low">Thấp</option>
                    <option value="normal">Bình thường</option>
                    <option value="high">Cao</option>
                  </select>
                </div>

                <button type="submit" className="btn btn-primary">Đăng Thông Báo</button>
              </form>
            </div>
          )}

          {/* Danh sách thông báo đã đăng. */}
          <div>
            {announcements.length > 0 ? (
              announcements.map(ann => (
                <div key={ann._id} className="card" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <h3>{ann.title}</h3>
                      <p style={{ marginTop: '0.5rem', lineHeight: '1.6' }}>{ann.content}</p>
                    </div>
                    {/* Huy hiệu "Quan trọng" nếu priority high. */}
                    {ann.priority === 'high' && (
                      <span style={{ background: '#E63946', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        Quan trọng
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="card">
                <p style={{ color: '#999', textAlign: 'center' }}>Chưa có thông báo nào</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB Học sinh: chỉ teacher thấy; form thêm + bảng danh sách. */}
      {activeTab === 'students' && userRole === 'teacher' && (
        <div>
          {/* Form thêm học sinh bằng email. */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h3>Thêm Học Sinh</h3>
            <form onSubmit={handleEnrollStudent}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input
                  type="email"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  placeholder="Email học sinh"
                  required
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary">Thêm</button>
              </div>
            </form>
          </div>

          {/* Bảng danh sách học sinh trong lớp. */}
          <div className="card">
            <h3>Danh Sách Học Sinh ({classData.students?.length || 0})</h3>
            <div style={{ marginTop: '1rem' }}>
              {classData.students && classData.students.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee' }}>
                      <th style={{ padding: '1rem', textAlign: 'left' }}>Tên</th>
                      <th style={{ padding: '1rem', textAlign: 'left' }}>Email</th>
                      <th style={{ padding: '1rem', textAlign: 'center' }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Mỗi học sinh 1 hàng: tên, email, nút Xóa (hiện chưa gắn API xóa). */}
                    {classData.students.map(student => (
                      <tr key={student._id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '1rem' }}>{student.name}</td>
                        <td style={{ padding: '1rem' }}>{student.email}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <button className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#999', textAlign: 'center' }}>Chưa có học sinh nào</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Xuất trang để App.js gắn vào Route /class/:id.
export default ClassDetail;
