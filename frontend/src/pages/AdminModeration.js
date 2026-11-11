import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import usePagedList from '../hooks/usePagedList';
import Pagination from '../components/Pagination';
import { lockStatusLabels, policyReasonLabels } from '../config/policyLabels';

const warningStatusLabels = {
  pending: 'Chờ kháng cáo',
  appealed: 'Có kháng cáo',
  confirmed: 'Đã xác nhận',
  dismissed: 'Đã gỡ',
};

const sanctionLabels = {
  suspension_7_days: 'Đình chỉ 7 ngày',
  suspension_1_month: 'Đình chỉ 1 tháng',
  permanent_ban: 'Khóa vĩnh viễn',
};

const hiddenWarningsKey = () => `admin-hidden-warnings:${localStorage.getItem('userId') || 'unknown'}`;
const readHiddenWarnings = () => {
  try { return new Set(JSON.parse(localStorage.getItem(hiddenWarningsKey()) || '[]')); }
  catch (_) { return new Set(); }
};

const AdminModeration = () => {
  const [section, setSection] = useState('warnings');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const reviewPending = useRef(false);
  const [error, setError] = useState('');
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [notice, setNotice] = useState('');
  const [hiddenWarnings, setHiddenWarnings] = useState(readHiddenWarnings);
  const [showHiddenWarnings, setShowHiddenWarnings] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem(hiddenWarningsKey(), JSON.stringify([...hiddenWarnings]));
  }, [hiddenWarnings]);

  const token = localStorage.getItem('token');
  // Chỉ tải tab đang mở. Mỗi hook giữ trang riêng và bỏ response cũ theo phiên.
  const warningList = usePagedList('/api/moderation/warnings', {}, section === 'warnings');
  const studentList = usePagedList('/api/moderation/students', {}, section === 'students');
  const accountsList = usePagedList('/api/users', { role: 'student', view: 'moderation' }, section === 'accounts');
  const classList = usePagedList('/api/moderation/classes', {}, section === 'classes');
  const activeList = { warnings: warningList, students: studentList, accounts: accountsList, classes: classList }[section];
  const warnings = warningList.data;
  const affectedStudents = studentList.data;
  const students = accountsList.data;
  const violationClasses = classList.data;
  const visibleWarnings = showHiddenWarnings ? warnings : warnings.filter((warning) => !hiddenWarnings.has(warning._id));

  // Ẩn thẻ trong giao diện của admin hiện tại, không sửa cảnh báo hay chế tài trên server.
  const toggleWarningVisibility = (warningId) => {
    setHiddenWarnings((current) => {
      const next = new Set(current);
      if (next.has(warningId)) next.delete(warningId); else next.add(warningId);
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    setSummary(null);
    setSummaryLoading(true);
    setSummaryError('');
    axios.get('/api/moderation/summary', { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 })
      .then((response) => {
        if (active && localStorage.getItem('token') === token) setSummary(response.data);
      })
      .catch((requestError) => {
        if (active && localStorage.getItem('token') === token) {
          setSummaryError(requestError.response?.data?.message || 'Không tải được tổng hồ sơ vi phạm.');
        }
      })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [token, summaryRevision]);

  const handleReviewWarning = async (warning, decision) => {
    if (reviewPending.current) return;
    const action = decision === 'dismiss' ? 'gỡ cảnh báo' : 'xác nhận vi phạm';
    if (!window.confirm(`Bạn có chắc muốn ${action} này?`)) return;
    reviewPending.current = true;
    setReviewing(true);
    setError('');
    try {
      await axios.patch(`/api/student-warnings/${warning._id}/review`, {
        decision,
        response: decision === 'dismiss'
          ? 'Kháng cáo được chấp thuận; cảnh báo đã được gỡ.'
          : 'Kháng cáo bị từ chối; cảnh báo được xác nhận.',
      });
      // Chỉ request lại tab đang mở; tab đã tải khác được đánh dấu cũ để tải lại khi mở.
      warningList.reload();
      studentList.reload();
      classList.reload();
      setSummaryRevision((value) => value + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể xử lý cảnh báo.');
    } finally {
      reviewPending.current = false;
      setReviewing(false);
    }
  };

  // Xóa mềm tài khoản học sinh qua API quản trị; dữ liệu lịch sử được backend giữ lại.
  const handleDeleteStudent = async (student) => {
    if (deletingStudent || !window.confirm(`Xóa tài khoản học sinh ${student.name} (${student.email})?`)) return;
    setDeletingStudent(student._id);
    setError('');
    setNotice('');
    try {
      await axios.delete(`/api/users/${student._id}`);
      accountsList.reload();
      setNotice(`Đã xóa tài khoản ${student.name}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể xóa tài khoản học sinh.');
    } finally {
      setDeletingStudent(null);
    }
  };

  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">KHÔNG GIAN QUẢN TRỊ</p>
          <h1>Hồ sơ vi phạm</h1>
          <p className="admin-intro">Lưu trữ cảnh báo, kháng cáo, chế tài tài khoản và lớp vi phạm.</p>
        </div>
        <div className="admin-summary" aria-label="Tổng quan hồ sơ vi phạm">
          <div><span>Tổng cảnh báo</span><strong>{summary?.totalWarnings ?? '—'}</strong></div>
          <div><span>Đang xử lý</span><strong>{summary?.openWarnings ?? '—'}</strong></div>
          <div><span>Lớp có hồ sơ</span><strong>{summary?.violationClasses ?? '—'}</strong></div>
        </div>
      </header>

      <div className="moderation-tabs" role="tablist" aria-label="Loại hồ sơ">
        <button aria-selected={section === 'warnings'} className={section === 'warnings' ? 'is-active' : ''} onClick={() => setSection('warnings')} role="tab" type="button">Cảnh báo &amp; kháng cáo</button>
        <button aria-selected={section === 'students'} className={section === 'students' ? 'is-active' : ''} onClick={() => setSection('students')} role="tab" type="button">Học sinh bị xử lý</button>
        <button aria-selected={section === 'accounts'} className={section === 'accounts' ? 'is-active' : ''} onClick={() => setSection('accounts')} role="tab" type="button">Tài khoản học sinh</button>
        <button aria-selected={section === 'classes'} className={section === 'classes' ? 'is-active' : ''} onClick={() => setSection('classes')} role="tab" type="button">Lớp vi phạm</button>
      </div>

      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="tool-notice" role="status">{notice}</div>}
      {summaryError && <div className="admin-alert" role="alert">{summaryError}</div>}
      <button className="admin-back" type="button" disabled={summaryLoading}
        onClick={() => setSummaryRevision((value) => value + 1)}>{summaryLoading ? 'Đang tải tổng...' : 'Làm mới tổng hồ sơ'}</button>
      <Pagination list={activeList} label="hồ sơ kiểm duyệt" />
      {activeList.loading && activeList.data.length === 0 ? <p className="admin-state">Đang tải hồ sơ...</p> : (
        <>
          {section === 'warnings' && (
            <section className="moderation-section">
              <header className="admin-warning-heading">
                <div><h2>Cảnh báo học sinh</h2><p>Cảnh báo chỉ được tính sau khi Admin xác nhận hoặc hết hạn kháng cáo.</p></div>
                {hiddenWarnings.size > 0 && <button className="btn btn-secondary" onClick={() => setShowHiddenWarnings((value) => !value)} type="button">{showHiddenWarnings ? 'Ẩn lại thông báo' : `Hiện ${hiddenWarnings.size} thông báo đã ẩn`}</button>}
              </header>
              {visibleWarnings.length === 0 ? <p className="admin-state">{warningList.error ? 'Chưa tải được danh sách cảnh báo.' : warnings.length ? 'Mọi thông báo trên trang này đã được ẩn.' : 'Chưa có hồ sơ cảnh báo.'}</p> : (
                <div className="admin-warning-list">
                  {visibleWarnings.map((warning) => (
                    <article className="admin-warning-card" key={warning._id}>
                      <div className="admin-warning-card-heading">
                        <div><strong>{warning.student?.name || 'Học sinh không xác định'}</strong><span>{warning.student?.email} · {warning.class?.name || 'Lớp đã xóa'}</span></div>
                        <span className={`status-indicator ${['pending', 'appealed'].includes(warning.status) ? 'is-locked' : ''}`}>{warningStatusLabels[warning.status] || warning.status}</span>
                      </div>
                      <p><strong>Mức {warning.policyLevel}:</strong> {policyReasonLabels[warning.reasonCode] || warning.reasonCode} · {warning.details}</p>
                      <small>Gửi {new Date(warning.issuedAt).toLocaleString('vi-VN')} · Hạn kháng cáo {new Date(warning.appealDeadline).toLocaleString('vi-VN')}</small>
                      <small>Số lần bị gỡ khỏi lớp: {warning.student?.classRemovalIncidents || 0} · Chế tài tài khoản: {warning.student?.disciplinarySanctions || 0}</small>
                      {warning.appealMessage && <blockquote><strong>Kháng cáo:</strong> {warning.appealMessage}</blockquote>}
                      {warning.status === 'appealed' && (
                        <div className="admin-warning-actions">
                          <button className="btn btn-secondary" disabled={reviewing || warningList.loading} onClick={() => handleReviewWarning(warning, 'dismiss')} type="button">Chấp thuận, gỡ cảnh báo</button>
                          <button className="btn btn-danger" disabled={reviewing || warningList.loading} onClick={() => handleReviewWarning(warning, 'confirm')} type="button">Từ chối, tính cảnh báo</button>
                        </div>
                      )}
                      {warning.violationCounted && <small className="warning-counted-note">Đã tính {warning.classWarningCount}/3 cảnh báo trong lớp.</small>}
                      {warning.classRemovalApplied && <small className="warning-counted-note">Học sinh đã bị gỡ khỏi lớp.</small>}
                      {warning.accountSanction && warning.accountSanction !== 'none' && <small className="warning-counted-note">{sanctionLabels[warning.accountSanction] || warning.accountSanction}</small>}
                      <button className="btn btn-secondary" onClick={() => toggleWarningVisibility(warning._id)} type="button">{hiddenWarnings.has(warning._id) ? 'Hiện lại thông báo' : 'Ẩn thông báo'}</button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === 'students' && (
            <section className="moderation-section">
              <h2>Học sinh bị xử lý</h2>
              {affectedStudents.length === 0 ? <p className="admin-state">{studentList.error ? 'Chưa tải được danh sách học sinh.' : 'Chưa có học sinh bị gỡ hoặc đình chỉ.'}</p> : (
                <div className="moderation-record-list">
                  {affectedStudents.map((student) => (
                    <article className="moderation-record" key={student._id}>
                      <div><strong>{student.name}</strong><span>{student.email}</span></div>
                      <div className="moderation-record-meta">
                        <span>{student.classRemovalIncidents || 0} lần bị gỡ khỏi lớp</span>
                        <span>{student.disciplinarySanctions || 0} chế tài tài khoản</span>
                      </div>
                      <span className={`status-indicator ${student.permanentlyBanned || (student.suspendedUntil && new Date(student.suspendedUntil) > new Date()) ? 'is-locked' : ''}`}>
                        {student.permanentlyBanned ? 'Khóa vĩnh viễn' : student.suspendedUntil && new Date(student.suspendedUntil) > new Date() ? `Đình chỉ đến ${new Date(student.suspendedUntil).toLocaleString('vi-VN')}` : 'Đã khôi phục truy cập'}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === 'accounts' && (
            <section className="moderation-section">
              <h2>Tài khoản học sinh</h2>
              {students.length === 0 ? <p className="admin-state">{accountsList.error ? 'Chưa tải được tài khoản học sinh.' : 'Chưa có tài khoản học sinh.'}</p> : (
                <div className="moderation-record-list">
                  {students.map((student) => (
                    <article className="moderation-record" key={student._id}>
                      <div><strong>{student.name}</strong><span>{student.email}</span></div>
                      <button className="btn btn-danger" disabled={!!deletingStudent} onClick={() => handleDeleteStudent(student)} type="button">
                        {deletingStudent === student._id ? 'Đang xóa...' : 'Xóa tài khoản'}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === 'classes' && (
            <section className="moderation-section">
              <h2>Lớp học có hồ sơ vi phạm</h2>
              {violationClasses.length === 0 ? <p className="admin-state">{classList.error ? 'Chưa tải được danh sách lớp.' : 'Chưa có lớp vi phạm.'}</p> : (
                <div className="moderation-record-list">
                  {violationClasses.map((classItem) => (
                    <article className="moderation-record" key={classItem._id}>
                      <div><strong>{classItem.name}</strong><span>{classItem.teacher?.name || 'Chưa gán giáo viên'} · {classItem.subject}</span></div>
                      <div><span>{classItem.lockNotice?.reasonCode ? policyReasonLabels[classItem.lockNotice.reasonCode] || classItem.lockNotice.reasonCode : '—'}</span><small>{classItem.lockNotice?.details || '—'}</small></div>
                      <span className={`status-indicator ${classItem.status === 'inactive' || ['pending', 'appealed'].includes(classItem.lockNotice?.status) ? 'is-locked' : ''}`}>
                        {classItem.status === 'inactive' ? 'Đã khóa' : lockStatusLabels[classItem.lockNotice?.status] || classItem.lockNotice?.status || '—'}
                      </span>
                      <button className="admin-back" onClick={() => navigate(`/admin/classes/${classItem._id}`)} type="button">Mở hồ sơ lớp →</button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

    </main>
  );
};

export default AdminModeration;
