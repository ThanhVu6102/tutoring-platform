import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { lockStatusLabels, policyReasonLabels } from '../config/policyLabels';

const AdminClassDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [warningStudent, setWarningStudent] = useState(null);
  const [warningForm, setWarningForm] = useState({ reasonCode: 'spam', policyLevel: '1', details: '' });
  const [savingWarning, setSavingWarning] = useState(false);
  const [warningError, setWarningError] = useState('');
  const [warningSuccess, setWarningSuccess] = useState('');
  const [lockForm, setLockForm] = useState({ reasonCode: 'spam', policyLevel: '1', details: '' });
  const [lockReviewBusy, setLockReviewBusy] = useState(false);
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
    if (classData.status !== 'inactive') {
      setShowLockDialog(true);
      return;
    }
    if (!window.confirm(`Mở khóa lớp "${classData.name}"?`)) return;

    setSavingStatus(true);
    setError('');
    try {
      const response = await axios.patch(`/api/classes/${id}/status`, { status: 'active' });
      setClassData(response.data.class);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể mở khóa lớp học.');
    } finally {
      setSavingStatus(false);
    }
  };

  const submitLockNotice = async (event) => {
    event.preventDefault();
    setLockReviewBusy(true);
    setError('');
    try {
      const response = await axios.patch(`/api/classes/${id}/lock-notice`, lockForm);
      setClassData(response.data.class);
      setShowLockDialog(false);
      setLockForm({ reasonCode: 'spam', policyLevel: '1', details: '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể gửi thông báo vi phạm.');
    } finally {
      setLockReviewBusy(false);
    }
  };

  const reviewLockNotice = async (decision) => {
    const action = decision === 'lock' ? 'khóa lớp chính thức' : 'hủy thông báo khóa';
    if (!window.confirm(`Xác nhận ${action} "${classData.name}"?`)) return;
    setLockReviewBusy(true);
    setError('');
    try {
      const response = await axios.patch(`/api/classes/${id}/lock-review`, {
        decision,
        response: decision === 'lock' ? 'Thông báo khóa đã được xác nhận.' : 'Thông báo khóa đã được hủy sau khi xem xét.',
      });
      setClassData(response.data.class);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể cập nhật quyết định khóa lớp.');
    } finally {
      setLockReviewBusy(false);
    }
  };

  const submitStudentWarning = async (event) => {
    event.preventDefault();
    if (!warningStudent) return;
    setSavingWarning(true);
    setWarningError('');
    try {
      await axios.post(`/api/student-warnings/${warningStudent._id}`, {
        classId: id,
        reasonCode: warningForm.reasonCode,
        policyLevel: Number(warningForm.policyLevel),
        details: warningForm.details,
      });
      setWarningSuccess(`Đã gửi cảnh báo cho ${warningStudent.name}.`);
      setWarningStudent(null);
      setWarningForm({ reasonCode: 'spam', policyLevel: '1', details: '' });
    } catch (requestError) {
      setWarningError(requestError.response?.data?.message || 'Không thể gửi cảnh báo.');
    } finally {
      setSavingWarning(false);
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
  const lockNotice = classData.lockNotice || {};
  const appealWindowOpen = lockNotice.status === 'pending'
    && lockNotice.appealDeadline
    && new Date(lockNotice.appealDeadline) > new Date();
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
      {warningSuccess && <div className="warning-success-banner" role="status">{warningSuccess}</div>}

      <section className="admin-detail-heading">
        <div>
          <span className={`status-indicator ${isLocked || ['pending', 'appealed'].includes(lockNotice.status) ? 'is-locked' : ''}`}>
            {isLocked ? 'Đã khóa chính thức' : lockNotice.status === 'appealed' ? 'Đã nhận kháng cáo' : lockNotice.status === 'pending' ? 'Chờ phản hồi 24 giờ' : 'Đang hoạt động'}
          </span>
          <h1>{classData.name}</h1>
          <p>{classData.description || 'Chưa có mô tả cho lớp học này.'}</p>
        </div>
        <button
          className={`admin-status-button ${isLocked ? 'is-unlock' : 'is-lock'}`}
          disabled={savingStatus || ['pending', 'appealed'].includes(lockNotice.status)}
          onClick={handleStatusChange}
          type="button"
        >
          {savingStatus ? 'Đang cập nhật...' : isLocked ? 'Mở khóa lớp' : ['pending', 'appealed'].includes(lockNotice.status) ? 'Đang xử lý thông báo' : 'Khóa lớp'}
        </button>
      </section>

      {lockNotice.status && lockNotice.status !== 'none' && (
        <section className="lock-notice-panel">
          <div className="lock-notice-heading">
            <div>
              <p className="admin-eyebrow">HỒ SƠ XỬ LÝ VI PHẠM · MỨC {lockNotice.policyLevel || '—'}</p>
              <h2>{lockNotice.status === 'pending' ? 'Thông báo khóa lớp đã gửi' : lockNotice.status === 'appealed' ? 'Giáo viên đã kháng cáo' : lockNotice.status === 'locked' ? 'Lớp đã bị khóa chính thức' : 'Thông báo khóa đã được hủy'}</h2>
            </div>
            <span className={`status-indicator ${lockNotice.status === 'dismissed' ? '' : 'is-locked'}`}>{lockStatusLabels[lockNotice.status] || lockNotice.status}</span>
          </div>
          <dl className="admin-info-list">
            <div><dt>Lý do</dt><dd>{policyReasonLabels[lockNotice.reasonCode] || 'Chưa ghi'}</dd></div>
            <div><dt>Chi tiết</dt><dd>{lockNotice.details || '—'}</dd></div>
            <div><dt>Thông báo lúc</dt><dd>{lockNotice.issuedAt ? new Date(lockNotice.issuedAt).toLocaleString('vi-VN') : '—'}</dd></div>
            <div><dt>Hạn kháng cáo</dt><dd>{lockNotice.appealDeadline ? new Date(lockNotice.appealDeadline).toLocaleString('vi-VN') : '—'}</dd></div>
            {lockNotice.appealMessage && <div><dt>Nội dung kháng cáo</dt><dd>{lockNotice.appealMessage}</dd></div>}
            {lockNotice.adminResponse && <div><dt>Phản hồi Admin</dt><dd>{lockNotice.adminResponse}</dd></div>}
          </dl>
          {['pending', 'appealed'].includes(lockNotice.status) && (
            <div className="lock-review-actions">
              <button className="btn btn-secondary" disabled={lockReviewBusy || appealWindowOpen} onClick={() => reviewLockNotice('dismiss')} type="button">Hủy thông báo</button>
              <button className="btn btn-danger" disabled={lockReviewBusy || appealWindowOpen} onClick={() => reviewLockNotice('lock')} type="button">Khóa lớp chính thức</button>
              {appealWindowOpen && <p>Chờ hết hạn 24 giờ hoặc nhận kháng cáo trước khi chốt quyết định.</p>}
            </div>
          )}
        </section>
      )}

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
                  <button className="student-warning-trigger" onClick={() => {
                    setWarningError('');
                    setWarningStudent(student);
                  }} type="button">Tạo cảnh báo</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showLockDialog && (
        <div className="policy-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowLockDialog(false);
        }}>
          <section aria-labelledby="lock-dialog-title" aria-modal="true" className="policy-modal" role="dialog">
            <button aria-label="Đóng" className="policy-modal-close" onClick={() => setShowLockDialog(false)} type="button">×</button>
            <p className="admin-eyebrow">THÔNG BÁO TRƯỚC KHI KHÓA</p>
            <h2 id="lock-dialog-title">Thông báo vi phạm lớp học</h2>
            <p>Giáo viên sẽ nhận thông báo và có 24 giờ để gửi kháng cáo. Lớp chưa bị khóa trong thời gian này.</p>
            <form className="lock-notice-form" onSubmit={submitLockNotice}>
              <label>Mức độ vi phạm
                <select value={lockForm.policyLevel} onChange={(event) => setLockForm({ ...lockForm, policyLevel: event.target.value })}>
                  <option value="1">Mức 1 · Nhẹ</option>
                  <option value="2">Mức 2 · Trung bình</option>
                  <option value="3">Mức 3 · Nghiêm trọng</option>
                </select>
              </label>
              <label>Chính sách vi phạm
                <select value={lockForm.reasonCode} onChange={(event) => setLockForm({ ...lockForm, reasonCode: event.target.value })}>
                  <option value="spam">Spam / quảng cáo / liên kết độc hại</option>
                  <option value="class_disruption">Gây gián đoạn lớp học</option>
                  <option value="abusive_content">Ngôn từ xúc phạm / nội dung không phù hợp</option>
                  <option value="account_sharing">Chia sẻ tài khoản</option>
                  <option value="copyright">Vi phạm bản quyền</option>
                  <option value="academic_fraud">Gian lận học tập hoặc hệ thống</option>
                  <option value="privacy_breach">Vi phạm quyền riêng tư</option>
                  <option value="financial_misconduct">Vi phạm minh bạch tài chính</option>
                  <option value="illegal_content">Nội dung trái pháp luật</option>
                  <option value="other">Khác</option>
                </select>
              </label>
              <label>Mô tả cụ thể / bằng chứng<textarea maxLength="2000" onChange={(event) => setLockForm({ ...lockForm, details: event.target.value })} required rows="4" value={lockForm.details} /></label>
              <div className="policy-modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowLockDialog(false)} type="button">Hủy</button>
                <button className="btn btn-danger" disabled={lockReviewBusy} type="submit">{lockReviewBusy ? 'Đang gửi...' : 'Gửi thông báo 24 giờ'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {warningStudent && (
        <div className="policy-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setWarningStudent(null); }} role="presentation">
          <section aria-labelledby="student-warning-title" aria-modal="true" className="policy-modal" role="dialog">
            <button aria-label="Đóng" className="policy-modal-close" onClick={() => setWarningStudent(null)} type="button">×</button>
            <p className="admin-eyebrow">HỒ SƠ HỌC SINH · {classData.name}</p>
            <h2 id="student-warning-title">Cảnh báo {warningStudent.name}</h2>
            <p>{warningStudent.email} · Học sinh sẽ có 7 ngày để kháng cáo. Cảnh báo chờ kháng cáo chưa được tính.</p>
            {warningError && <div className="admin-alert" role="alert">{warningError}</div>}
            <form className="lock-notice-form" onSubmit={submitStudentWarning}>
              <label>Mức vi phạm
                <select value={warningForm.policyLevel} onChange={(event) => setWarningForm({ ...warningForm, policyLevel: event.target.value })}>
                  <option value="1">Mức 1 · Nhẹ</option>
                  <option value="2">Mức 2 · Trung bình</option>
                  <option value="3">Mức 3 · Nghiêm trọng</option>
                </select>
              </label>
              <label>Quy định vi phạm
                <select value={warningForm.reasonCode} onChange={(event) => setWarningForm({ ...warningForm, reasonCode: event.target.value })}>
                  {Object.entries(policyReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Mô tả cụ thể / bằng chứng<textarea maxLength="2000" onChange={(event) => setWarningForm({ ...warningForm, details: event.target.value })} required rows="4" value={warningForm.details} /></label>
              <div className="policy-modal-actions">
                <button className="btn btn-secondary" onClick={() => setWarningStudent(null)} type="button">Hủy</button>
                <button className="btn btn-primary" disabled={savingWarning} type="submit">{savingWarning ? 'Đang gửi...' : 'Gửi cảnh báo'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
};

export default AdminClassDetail;