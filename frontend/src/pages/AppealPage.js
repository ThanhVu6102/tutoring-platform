import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { getAllPages } from '../utils/listRequests';
import { policyReasonLabels, lockStatusLabels } from '../config/policyLabels';

const warningStatusLabels = {
  pending: 'Chờ gửi kháng cáo',
  appealed: 'Đã gửi kháng cáo, chờ duyệt',
  confirmed: 'Đã xác nhận vi phạm',
  dismissed: 'Kháng cáo được chấp thuận (Đã gỡ)',
};

const AppealPage = () => {
  const role = localStorage.getItem('userRole');

  const [warnings, setWarnings] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Trạng thái nhập đơn kháng cáo: { [id]: message }
  const [appealForms, setAppealForms] = useState({});
  const [submittingId, setSubmittingId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      if (role === 'student') {
        const response = await axios.get('/api/student-warnings/mine');
        setWarnings(response.data);
      } else if (role === 'teacher') {
        const classItems = await getAllPages('/api/classes', { view: 'history' });
        setClasses(classItems);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu kháng cáo.');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMessageChange = (id, text) => {
    setAppealForms((prev) => ({ ...prev, [id]: text }));
  };

  // Học sinh gửi kháng cáo
  const submitStudentAppeal = async (warningId) => {
    const message = (appealForms[warningId] || '').trim();
    if (!message) {
      setError('Vui lòng nhập lý do / lời giải trình kháng cáo.');
      return;
    }
    setSubmittingId(warningId);
    setError('');
    setSuccess('');
    try {
      await axios.post(`/api/student-warnings/${warningId}/appeal`, { message });
      setSuccess('Đơn kháng cáo của bạn đã được gửi tới quản trị viên xét duyệt.');
      setAppealForms((prev) => ({ ...prev, [warningId]: '' }));
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi đơn kháng cáo.');
    } finally {
      setSubmittingId(null);
    }
  };

  // Giáo viên gửi kháng cáo cho lớp
  const submitTeacherAppeal = async (classId) => {
    const message = (appealForms[classId] || '').trim();
    if (!message) {
      setError('Vui lòng nhập nội dung kháng cáo cho lớp học.');
      return;
    }
    setSubmittingId(classId);
    setError('');
    setSuccess('');
    try {
      await axios.post(`/api/classes/${classId}/lock-appeal`, { message });
      setSuccess('Kháng cáo cho lớp học đã được gửi tới quản trị viên.');
      setAppealForms((prev) => ({ ...prev, [classId]: '' }));
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi kháng cáo.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) {
    return (
      <main className="appeal-page">
        <p role="status">Đang tải hồ sơ kháng cáo...</p>
      </main>
    );
  }

  // --- Dành cho Học Sinh ---
  const pendingStudentWarnings = warnings.filter((w) => w.status === 'pending');
  const appealedStudentWarnings = warnings.filter((w) => w.status === 'appealed');
  const pastStudentWarnings = warnings.filter((w) => ['confirmed', 'dismissed'].includes(w.status));

  // --- Dành cho Giáo Viên ---
  const pendingTeacherClasses = classes.filter((c) => c.lockNotice?.status === 'pending');
  const appealedTeacherClasses = classes.filter((c) => c.lockNotice?.status === 'appealed');
  const pastTeacherNotices = classes.flatMap((c) => {
    const history = (c.lockNoticeHistory || []).map((h) => ({ ...h, className: c.name, classId: c._id }));
    if (['locked', 'dismissed'].includes(c.lockNotice?.status)) {
      history.push({ ...c.lockNotice, className: c.name, classId: c._id });
    }
    return history;
  });

  return (
    <main className="appeal-page">
      <header className="appeal-heading">
        <p className="admin-eyebrow">QUYỀN LỢI &amp; MINH BẠCH HỆ THỐNG</p>
        <h1>Trung tâm kháng cáo</h1>
        <p>
          Nếu bạn cho rằng cảnh báo vi phạm được gửi nhầm hoặc có lý do chính đáng, bạn có quyền gửi giải trình
          để Quản trị viên xem xét gỡ bỏ hoặc điều chỉnh cảnh báo.
          {role === 'student' && ' Thời hạn kháng cáo cho học sinh là 7 ngày kể từ khi nhận thông báo.'}
          {role === 'teacher' && ' Thời hạn kháng cáo thông báo khóa lớp là 24 giờ.'}
        </p>
      </header>

      {error && <div className="admin-alert" role="alert" style={{ marginBottom: '1.5rem' }}>{error}</div>}
      {success && <div className="tool-notice" role="status" style={{ marginBottom: '1.5rem' }}>{success}</div>}

      {/* GIAO DIỆN HỌC SINH */}
      {role === 'student' && (
        <div className="appeal-grid">
          {/* Cảnh báo đang chờ kháng cáo */}
          <section className="appeal-section">
            <header>
              <h2>Cảnh báo cần kháng cáo ({pendingStudentWarnings.length})</h2>
            </header>

            {pendingStudentWarnings.length === 0 ? (
              <p className="notification-empty">Hiện tại bạn không có cảnh báo nào cần kháng cáo. Rất tuyệt vời!</p>
            ) : (
              pendingStudentWarnings.map((warning) => {
                const deadline = new Date(warning.appealDeadline);
                const isExpired = deadline <= new Date();

                return (
                  <article className="appeal-card is-pending" key={warning._id}>
                    <div className="appeal-card-header">
                      <div>
                        <h3 className="appeal-card-title">Cảnh báo trong lớp: {warning.class?.name || 'Lớp học'}</h3>
                        <small style={{ color: '#6b7280' }}>
                          Nhận lúc: {new Date(warning.issuedAt).toLocaleString('vi-VN')}
                        </small>
                      </div>
                      <span className="appeal-badge badge-pending">⚠️ Chờ kháng cáo</span>
                    </div>

                    <dl className="appeal-info-grid">
                      <div>
                        <dt>Mức độ vi phạm</dt>
                        <dd>Mức {warning.policyLevel} / 3</dd>
                      </div>
                      <div>
                        <dt>Lý do vi phạm</dt>
                        <dd>{policyReasonLabels[warning.reasonCode] || warning.reasonCode}</dd>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Nội dung chi tiết từ Ban quản trị</dt>
                        <dd>{warning.details || 'Không có mô tả chi tiết.'}</dd>
                      </div>
                    </dl>

                    <div className="appeal-countdown">
                      <span>⏳ Hạn chót kháng cáo:</span>
                      <strong>{deadline.toLocaleString('vi-VN')}</strong>
                      {isExpired && <span style={{ color: '#dc2626' }}>(Đã quá hạn 7 ngày)</span>}
                    </div>

                    {!isExpired ? (
                      <form
                        className="appeal-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitStudentAppeal(warning._id);
                        }}
                      >
                        <label htmlFor={`appeal-input-${warning._id}`}>
                          Nội dung kháng cáo / Giải trình của bạn:
                        </label>
                        <textarea
                          id={`appeal-input-${warning._id}`}
                          maxLength={3000}
                          placeholder="Mô tả chi tiết lý do bạn cho rằng cảnh báo này không chính xác hoặc bằng chứng kèm theo..."
                          required
                          rows={4}
                          value={appealForms[warning._id] || ''}
                          onChange={(e) => handleMessageChange(warning._id, e.target.value)}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button
                            className="btn btn-primary"
                            disabled={submittingId === warning._id}
                            type="submit"
                          >
                            {submittingId === warning._id ? 'Đang gửi kháng cáo...' : '✉️ Gửi đơn kháng cáo'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p style={{ marginTop: '0.8rem', color: '#dc2626', fontSize: '0.88rem' }}>
                        Thời hạn 7 ngày để gửi kháng cáo đã kết thúc. Cảnh báo này đã được ghi nhận.
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </section>

          {/* Cảnh báo đã gửi kháng cáo, đang chờ Admin duyệt */}
          {appealedStudentWarnings.length > 0 && (
            <section className="appeal-section">
              <header>
                <h2>Đang chờ Ban quản trị duyệt ({appealedStudentWarnings.length})</h2>
              </header>
              {appealedStudentWarnings.map((warning) => (
                <article className="appeal-card is-appealed" key={warning._id}>
                  <div className="appeal-card-header">
                    <h3 className="appeal-card-title">{warning.class?.name || 'Lớp học'}</h3>
                    <span className="appeal-badge badge-appealed">⏳ Đã gửi kháng cáo</span>
                  </div>
                  <dl className="appeal-info-grid">
                    <div>
                      <dt>Lý do</dt>
                      <dd>{policyReasonLabels[warning.reasonCode] || warning.reasonCode}</dd>
                    </div>
                    <div>
                      <dt>Thời gian gửi</dt>
                      <dd>{warning.appealedAt ? new Date(warning.appealedAt).toLocaleString('vi-VN') : '—'}</dd>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <dt>Nội dung bạn đã gửi</dt>
                      <dd style={{ fontStyle: 'italic' }}>"{warning.appealMessage}"</dd>
                    </div>
                  </dl>
                  <p style={{ fontSize: '0.85rem', color: '#92400e', margin: 0 }}>
                    Ban quản trị đang xem xét kháng cáo của bạn. Kết quả sẽ được cập nhật sớm nhất.
                  </p>
                </article>
              ))}
            </section>
          )}

          {/* Lịch sử kháng cáo / Cảnh báo cũ */}
          {pastStudentWarnings.length > 0 && (
            <section className="appeal-section">
              <header>
                <h2>Lịch sử xử lý ({pastStudentWarnings.length})</h2>
              </header>
              {pastStudentWarnings.map((warning) => (
                <article
                  className={`appeal-card ${warning.status === 'dismissed' ? 'is-dismissed' : ''}`}
                  key={warning._id}
                >
                  <div className="appeal-card-header">
                    <h3 className="appeal-card-title">{warning.class?.name || 'Lớp học'}</h3>
                    <span className={`appeal-badge badge-${warning.status}`}>
                      {warningStatusLabels[warning.status] || warning.status}
                    </span>
                  </div>
                  <dl className="appeal-info-grid">
                    <div>
                      <dt>Lý do ban đầu</dt>
                      <dd>{policyReasonLabels[warning.reasonCode] || warning.reasonCode}</dd>
                    </div>
                    <div>
                      <dt>Giải quyết lúc</dt>
                      <dd>{warning.resolvedAt ? new Date(warning.resolvedAt).toLocaleString('vi-VN') : '—'}</dd>
                    </div>
                    {warning.appealMessage && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Nội dung kháng cáo của bạn</dt>
                        <dd>"{warning.appealMessage}"</dd>
                      </div>
                    )}
                    {warning.adminResponse && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Phản hồi từ Ban quản trị</dt>
                        <dd><strong>{warning.adminResponse}</strong></dd>
                      </div>
                    )}
                  </dl>
                </article>
              ))}
            </section>
          )}
        </div>
      )}

      {/* GIAO DIỆN GIÁO VIÊN */}
      {role === 'teacher' && (
        <div className="appeal-grid">
          {/* Thông báo khóa lớp đang chờ phản hồi */}
          <section className="appeal-section">
            <header>
              <h2>Thông báo khóa lớp cần kháng cáo ({pendingTeacherClasses.length})</h2>
            </header>

            {pendingTeacherClasses.length === 0 ? (
              <p className="notification-empty">Hiện tại không có lớp học nào nhận thông báo khóa hoặc cảnh báo. Các lớp đang hoạt động bình thường!</p>
            ) : (
              pendingTeacherClasses.map((classItem) => {
                const notice = classItem.lockNotice;
                const deadline = notice?.appealDeadline ? new Date(notice.appealDeadline) : null;
                const isExpired = deadline && deadline <= new Date();

                return (
                  <article className="appeal-card is-pending" key={classItem._id}>
                    <div className="appeal-card-header">
                      <div>
                        <h3 className="appeal-card-title">Lớp học: {classItem.name}</h3>
                        <small style={{ color: '#6b7280' }}>
                          Môn: {classItem.subject || '—'} · Khối: {classItem.grade || '—'}
                        </small>
                      </div>
                      <span className="appeal-badge badge-pending">⚠️ Chờ kháng cáo</span>
                    </div>

                    <dl className="appeal-info-grid">
                      <div>
                        <dt>Mức độ vi phạm</dt>
                        <dd>Mức {notice?.policyLevel || 1} / 3</dd>
                      </div>
                      <div>
                        <dt>Chính sách vi phạm</dt>
                        <dd>{policyReasonLabels[notice?.reasonCode] || notice?.reasonCode || 'Vi phạm chính sách'}</dd>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Chi tiết từ Ban quản trị</dt>
                        <dd>{notice?.details || 'Không có mô tả chi tiết.'}</dd>
                      </div>
                    </dl>

                    {deadline && (
                      <div className="appeal-countdown">
                        <span>⏳ Hạn chót kháng cáo (24 giờ):</span>
                        <strong>{deadline.toLocaleString('vi-VN')}</strong>
                        {isExpired && <span style={{ color: '#dc2626' }}>(Đã hết thời hạn 24h)</span>}
                      </div>
                    )}

                    {!isExpired ? (
                      <form
                        className="appeal-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitTeacherAppeal(classItem._id);
                        }}
                      >
                        <label htmlFor={`class-appeal-${classItem._id}`}>
                          Giải trình và đề nghị hủy thông báo khóa lớp:
                        </label>
                        <textarea
                          id={`class-appeal-${classItem._id}`}
                          maxLength={3000}
                          placeholder="Nhập giải trình của giáo viên phụ trách lớp, giải thích lý do hoặc các biện pháp khắc phục..."
                          required
                          rows={4}
                          value={appealForms[classItem._id] || ''}
                          onChange={(e) => handleMessageChange(classItem._id, e.target.value)}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button
                            className="btn btn-primary"
                            disabled={submittingId === classItem._id}
                            type="submit"
                          >
                            {submittingId === classItem._id ? 'Đang gửi kháng cáo...' : '✉️ Gửi kháng cáo cho lớp'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p style={{ marginTop: '0.8rem', color: '#dc2626', fontSize: '0.88rem' }}>
                        Thời hạn 24 giờ để kháng cáo đã kết thúc.
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </section>

          {/* Lớp đã gửi kháng cáo, chờ Admin xét duyệt */}
          {appealedTeacherClasses.length > 0 && (
            <section className="appeal-section">
              <header>
                <h2>Lớp đã gửi kháng cáo, chờ duyệt ({appealedTeacherClasses.length})</h2>
              </header>
              {appealedTeacherClasses.map((classItem) => (
                <article className="appeal-card is-appealed" key={classItem._id}>
                  <div className="appeal-card-header">
                    <h3 className="appeal-card-title">Lớp: {classItem.name}</h3>
                    <span className="appeal-badge badge-appealed">⏳ Đã gửi kháng cáo</span>
                  </div>
                  <dl className="appeal-info-grid">
                    <div>
                      <dt>Lý do</dt>
                      <dd>{policyReasonLabels[classItem.lockNotice?.reasonCode] || classItem.lockNotice?.reasonCode}</dd>
                    </div>
                    <div>
                      <dt>Gửi lúc</dt>
                      <dd>{classItem.lockNotice?.appealedAt ? new Date(classItem.lockNotice.appealedAt).toLocaleString('vi-VN') : '—'}</dd>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <dt>Nội dung giải trình của bạn</dt>
                      <dd style={{ fontStyle: 'italic' }}>"{classItem.lockNotice?.appealMessage}"</dd>
                    </div>
                  </dl>
                  <p style={{ fontSize: '0.85rem', color: '#92400e', margin: 0 }}>
                    Ban quản trị đang xem xét giải trình của bạn để quyết định hủy thông báo hoặc duy trì lớp.
                  </p>
                </article>
              ))}
            </section>
          )}

          {/* Lịch sử xử lý trước đây */}
          {pastTeacherNotices.length > 0 && (
            <section className="appeal-section">
              <header>
                <h2>Lịch sử thông báo lớp học ({pastTeacherNotices.length})</h2>
              </header>
              {pastTeacherNotices.map((notice, idx) => (
                <article
                  className={`appeal-card ${notice.status === 'dismissed' ? 'is-dismissed' : ''}`}
                  key={`${notice.classId}-${notice.issuedAt || idx}`}
                >
                  <div className="appeal-card-header">
                    <h3 className="appeal-card-title">Lớp: {notice.className}</h3>
                    <span className={`appeal-badge badge-${notice.status}`}>
                      {lockStatusLabels[notice.status] || notice.status}
                    </span>
                  </div>
                  <dl className="appeal-info-grid">
                    <div>
                      <dt>Lý do</dt>
                      <dd>{policyReasonLabels[notice.reasonCode] || notice.reasonCode}</dd>
                    </div>
                    <div>
                      <dt>Thời gian</dt>
                      <dd>{notice.resolvedAt ? new Date(notice.resolvedAt).toLocaleString('vi-VN') : '—'}</dd>
                    </div>
                    {notice.appealMessage && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Nội dung kháng cáo</dt>
                        <dd>"{notice.appealMessage}"</dd>
                      </div>
                    )}
                    {notice.adminResponse && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <dt>Phản hồi Admin</dt>
                        <dd><strong>{notice.adminResponse}</strong></dd>
                      </div>
                    )}
                  </dl>
                </article>
              ))}
            </section>
          )}
        </div>
      )}
    </main>
  );
};

export default AppealPage;
