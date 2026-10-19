import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

const AdminClassDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadClass = async () => {
      try {
        const response = await axios.get(`/api/classes/${id}`);
        setClassData(response.data);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Không tải được thông tin lớp học.');
      } finally {
        setLoading(false);
      }
    };

    const loadJoinRequests = async () => {
      try {
        const response = await axios.get(`/api/classes/${id}/join-requests`);
        setJoinRequests(response.data);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Không tải được yêu cầu tham gia.');
      }
    };

    loadClass();
    loadJoinRequests();
  }, [id]);

  const handleJoinRequest = async (studentId, action) => {
    setError('');
    try {
      await axios.patch(`/api/classes/${id}/join-requests/${studentId}`, { action });
      const [classResponse, requestsResponse] = await Promise.all([
        axios.get(`/api/classes/${id}`),
        axios.get(`/api/classes/${id}/join-requests`),
      ]);
      setClassData(classResponse.data);
      setJoinRequests(requestsResponse.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể xử lý yêu cầu tham gia.');
    }
  };

  const handleStatusChange = async () => {
    const nextStatus = classData.status === 'inactive' ? 'active' : 'inactive';
    const action = nextStatus === 'inactive' ? 'khóa' : 'mở khóa';
    if (!window.confirm(`Bạn có chắc muốn ${action} lớp "${classData.name}"?`)) return;

    setSavingStatus(true);
    setError('');
    try {
      const response = await axios.patch(`/api/classes/${id}/status`, { status: nextStatus });
      setClassData(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Không thể ${action} lớp học.`);
    } finally {
      setSavingStatus(false);
    }
  };

  if (loading) return <main className="admin-page"><p className="admin-state">Đang tải thông tin lớp...</p></main>;
  if (!classData) {
    return (
      <main className="admin-page">
        <button className="admin-back" onClick={() => navigate('/admin')} type="button">← Danh sách lớp</button>
        <div className="admin-alert" role="alert">{error || 'Không tìm thấy lớp học.'}</div>
      </main>
    );
  }

  const isLocked = classData.status === 'inactive';
  const students = classData.students || [];
  const createdDate = classData.createdAt
    ? new Date(classData.createdAt).toLocaleDateString('vi-VN')
    : 'Chưa cập nhật';
  const schedule = classData.schedule;
  const scheduleText = schedule?.dayOfWeek
    ? `${schedule.dayOfWeek}${schedule.startTime ? `, ${schedule.startTime}` : ''}${schedule.endTime ? ` - ${schedule.endTime}` : ''}`
    : 'Chưa xếp lịch';

  return (
    <main className="admin-page">
      <button className="admin-back" onClick={() => navigate('/admin')} type="button">← Danh sách lớp</button>
      {error && <div className="admin-alert" role="alert">{error}</div>}

      <section className="admin-detail-heading">
        <div>
          <span className={`status-indicator ${isLocked ? 'is-locked' : ''}`}>
            {isLocked ? 'Đã khóa' : 'Đang hoạt động'}
          </span>
          <h1>{classData.name}</h1>
          <p>{classData.description || 'Chưa có mô tả cho lớp học này.'}</p>
        </div>
        <button
          className={`admin-status-button ${isLocked ? 'is-unlock' : 'is-lock'}`}
          disabled={savingStatus}
          onClick={handleStatusChange}
          type="button"
        >
          {savingStatus ? 'Đang cập nhật...' : isLocked ? 'Mở khóa lớp' : 'Khóa lớp'}
        </button>
      </section>

      <section className="admin-detail-stats" aria-label="Sĩ số lớp">
        <div><span>Học sinh</span><strong>{students.length}</strong></div>
        <div><span>Sức chứa</span><strong>{classData.capacity || 50}</strong></div>
        <div><span>Còn chỗ</span><strong>{Math.max((classData.capacity || 50) - students.length, 0)}</strong></div>
      </section>

      <section className="admin-detail-section admin-join-requests">
        <header className="admin-student-heading">
          <h2>Yêu cầu tham gia</h2>
          <span>{joinRequests.length} đang chờ</span>
        </header>
        {joinRequests.length === 0 ? (
          <p className="admin-state">Không có yêu cầu cần duyệt.</p>
        ) : joinRequests.map((request) => (
          <div className="join-request-row" key={request._id || request.student?._id}>
            <div className="join-request-person">
              <strong>{request.student?.name || 'Học sinh'}</strong>
              <span>{request.student?.email || 'Chưa có email'}</span>
              <small>Gửi lúc {request.requestedAt ? new Date(request.requestedAt).toLocaleString('vi-VN') : 'vừa xong'}</small>
            </div>
            <div className="join-request-actions">
              <button className="btn btn-success" type="button" onClick={() => handleJoinRequest(request.student?._id, 'approve')}>Duyệt</button>
              <button className="btn btn-danger" type="button" onClick={() => handleJoinRequest(request.student?._id, 'reject')}>Từ chối</button>
            </div>
          </div>
        ))}
      </section>

      <div className="admin-detail-columns">
        <section className="admin-detail-section">
          <header><h2>Thông tin lớp</h2></header>
          <dl className="admin-info-list">
            <div><dt>Giáo viên phụ trách</dt><dd>{classData.teacher?.name || 'Chưa gán'}</dd></div>
            <div><dt>Email giáo viên</dt><dd>{classData.teacher?.email || 'Chưa cập nhật'}</dd></div>
            <div><dt>Môn học</dt><dd>{classData.subject || 'Chưa cập nhật'}</dd></div>
            <div><dt>Khối / trình độ</dt><dd>{classData.grade || 'Chưa cập nhật'}</dd></div>
            <div><dt>Lịch học</dt><dd>{scheduleText}</dd></div>
            <div><dt>Ngày tạo</dt><dd>{createdDate}</dd></div>
          </dl>
        </section>

        <section className="admin-detail-section">
          <header className="admin-student-heading">
            <h2>Danh sách học sinh</h2>
            <span>{students.length} học sinh</span>
          </header>
          {students.length === 0 ? (
            <p className="admin-state">Lớp chưa có học sinh.</p>
          ) : (
            <div className="admin-student-list">
              {students.map((student, index) => (
                <div className="admin-student-row" key={student._id || student.email || index}>
                  <span className="student-number">{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{student.name || 'Học sinh'}</strong><span>{student.email || 'Chưa có email'}</span></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default AdminClassDetail;