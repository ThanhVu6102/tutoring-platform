import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './AssignmentWorkspace.css';

const referenceId = (value) => String(value?._id || value || '').toLowerCase();
const webUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { return ['http:', 'https:'].includes(new URL(value.trim()).protocol) ? value.trim() : ''; }
  catch { return ''; }
};
const dateLabel = (value) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('vi-VN') : 'Chưa có';
const accessError = (error) => [401, 403, 404, 423].includes(error?.response?.status);
const errorMessage = (error, fallback) => ({
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác với bài tập này.',
  404: 'Bài tập hoặc bài nộp không còn tồn tại.',
  423: 'Lớp học đã bị khóa, không thể thực hiện thao tác này.',
}[error?.response?.status] || ([400, 409].includes(error?.response?.status)
  && typeof error.response.data?.message === 'string' ? error.response.data.message : fallback));

function SubmissionRecord({ submission, totalPoints }) {
  const url = webUrl(submission.fileUrl);
  return <div className="assignment-submission-record">
    {url ? <a className="resource-link" href={url} target="_blank" rel="noopener noreferrer">Mở bài nộp</a>
      : <p>Đường dẫn bài nộp không hợp lệ; không thể mở liên kết.</p>}
    <p>Nộp lúc: {dateLabel(submission.submittedAt)}{submission.isLate && <strong> · Nộp muộn</strong>}</p>
    <p>Điểm: {Number.isFinite(submission.score) ? `${submission.score} / ${totalPoints}` : 'Chưa chấm'}</p>
    {submission.feedback && <p className="assignment-feedback"><strong>Nhận xét:</strong> {submission.feedback}</p>}
    {submission.gradedAt && <p>Chấm lúc: {dateLabel(submission.gradedAt)}</p>}
  </div>;
}

function GradeForm({ submission, totalPoints, studentName, busy, onGrade }) {
  const [score, setScore] = useState(submission.score ?? '');
  const [feedback, setFeedback] = useState(submission.feedback || '');
  const [error, setError] = useState('');
  const saving = useRef(false);
  const studentId = referenceId(submission.student);
  useEffect(() => {
    setScore(submission.score ?? '');
    setFeedback(submission.feedback || '');
  }, [submission.score, submission.feedback]);
  const submit = async (event) => {
    event.preventDefault();
    if (busy || saving.current) return;
    const points = Number(score);
    if (String(score).trim() === '' || !Number.isFinite(points) || points < 0
      || !Number.isFinite(totalPoints) || points > totalPoints) {
      setError('Điểm phải là số từ 0 đến tổng điểm của bài tập.');
      return;
    }
    setError('');
    saving.current = true;
    try {
      if (Number.isFinite(submission.score)
        && !window.confirm(`Cập nhật điểm và nhận xét đã lưu cho ${studentName}?`)) return;
      await onGrade({ studentId, score: points, feedback });
    } finally { saving.current = false; }
  };
  return <form className="assignment-form" aria-label={`Chấm bài của ${studentName}`} onSubmit={submit}>
    {error && <p role="alert">{error}</p>}
    <label htmlFor={`assignment-score-${studentId}`}>Điểm (0–{totalPoints})</label>
    <input id={`assignment-score-${studentId}`} name="score" type="number" min="0" max={totalPoints} step="any" required disabled={busy}
      value={score} onChange={(event) => setScore(event.target.value)} />
    {/* Nhãn tách khỏi textarea để tên truy cập không bị lẫn nhận xét đã lưu. */}
    <label htmlFor={`assignment-feedback-${studentId}`}>Nhận xét</label>
    <textarea id={`assignment-feedback-${studentId}`} name="feedback" rows="3" disabled={busy} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
    <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Đang xử lý...' : 'Lưu điểm'}</button>
  </form>;
}

// Chi tiết tải riêng, không đưa submissions trở lại API danh sách hoặc cache giữa tài khoản.
export default function AssignmentWorkspace({ assignmentId, classId, userRole, students = [], onClose }) {
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [invalidSession, setInvalidSession] = useState(false);
  const session = useRef({ token: localStorage.getItem('token'), userId: localStorage.getItem('userId') }).current;
  const pending = useRef(false);
  const mounted = useRef(false);
  const heading = useRef(null);
  const scope = `${classId}:${assignmentId}:${userRole}`;
  const currentScope = useRef(scope);
  const loadedScope = useRef('');
  currentScope.current = scope;
  const sessionMatches = useCallback(() => Boolean(session.token && session.userId)
    && localStorage.getItem('token') === session.token && localStorage.getItem('userId') === session.userId
    && localStorage.getItem('userRole') === userRole, [session, userRole]);
  const mayUpdate = (requestScope) => mounted.current && currentScope.current === requestScope && sessionMatches();

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    const checkSession = () => { if (!sessionMatches()) setInvalidSession(true); };
    window.addEventListener('storage', checkSession);
    return () => { mounted.current = false; window.removeEventListener('storage', checkSession); };
  }, [sessionMatches]);

  useEffect(() => {
    let active = true;
    if (loadedScope.current !== scope) {
      setAssignment(null);
      loadedScope.current = scope;
    }
    setError('');
    if (!sessionMatches() || !['student', 'teacher', 'admin'].includes(userRole)) {
      setInvalidSession(true);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    axios.get(`/api/assignments/${assignmentId}`).then(({ data }) => {
      if (!active || !sessionMatches()) return;
      if (referenceId(data?._id) !== referenceId(assignmentId) || referenceId(data?.class) !== referenceId(classId)) {
        setAssignment(null);
        setError('Dữ liệu bài tập không khớp lớp đang mở.');
        return;
      }
      setAssignment(data);
      const own = (Array.isArray(data.submissions) ? data.submissions : [])
        .find((submission) => referenceId(submission.student) === referenceId(session.userId));
      setFileUrl(typeof own?.fileUrl === 'string' ? own.fileUrl : '');
    }).catch((requestError) => {
      if (active && sessionMatches()) {
        setError(errorMessage(requestError, 'Không tải được bài tập. Dữ liệu hiện tại có thể chưa cập nhật; vui lòng thử tải lại.'));
        if (accessError(requestError)) setAssignment(null);
      }
    }).finally(() => { if (active && sessionMatches()) setLoading(false); });
    return () => { active = false; };
  }, [assignmentId, classId, userRole, refresh, session, sessionMatches, scope]);

  // Một lần ghi tại một thời điểm, kể cả hai sự kiện submit trong cùng lượt render.
  const mutate = async (action, body, success) => {
    if (pending.current || loading || !assignment || !sessionMatches()) return;
    const requestScope = scope;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await axios.post(`/api/assignments/${assignmentId}/${action}`, body);
      if (!mayUpdate(requestScope)) return;
      setNotice(response.data?.message || success);
      // Chỉ đọc lại sau thành công; nếu GET lỗi, nút thử lại không gửi lại POST.
      setRefresh((value) => value + 1);
    } catch (requestError) {
      if (!mayUpdate(requestScope)) return;
      setError(errorMessage(requestError, 'Không thể lưu thay đổi. Nội dung bạn nhập được giữ lại.'));
      if (accessError(requestError)) setAssignment(null);
    } finally {
      pending.current = false;
      if (mayUpdate(requestScope)) setBusy(false);
    }
  };

  const studentView = userRole === 'student';
  const submissions = Array.isArray(assignment?.submissions) ? assignment.submissions : [];
  // Phòng vệ thêm ở UI; bảo vệ thực tế vẫn là DTO và kiểm tra quyền ở backend.
  const ownSubmissions = submissions.filter((submission) => referenceId(submission.student) === referenceId(session.userId));
  const submitFile = async (event) => {
    event.preventDefault();
    if (pending.current || loading) return;
    const url = webUrl(fileUrl);
    if (!url) { setError('Vui lòng nhập đường dẫn HTTP hoặc HTTPS hợp lệ.'); return; }
    if (ownSubmissions.length && !window.confirm('Cập nhật đường dẫn bài nộp hiện tại? Điểm và nhận xét đã có vẫn được giữ nguyên.')) return;
    await mutate('submit', { fileUrl: url }, 'Đã nộp bài tập.');
  };

  return <section className="assignment-workspace card" aria-labelledby="assignment-workspace-title" aria-busy={loading || busy}>
    <header className="assignment-workspace-heading">
      <h3 id="assignment-workspace-title" ref={heading} tabIndex="-1">{assignment?.title || 'Chi tiết bài tập'}</h3>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>Đóng chi tiết</button>
    </header>
    {invalidSession || !sessionMatches() ? <p role="alert">Phiên đăng nhập đã thay đổi. Vui lòng mở lại bài tập sau khi đăng nhập.</p> : <>
      {notice && <p className="tool-notice" role="status">{notice}</p>}
      {error && <div className="admin-alert" role="alert"><p>{error}</p>
        {!loading && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Thử tải lại</button>}
      </div>}
      {loading && <p role="status">Đang tải chi tiết bài tập...</p>}
      {assignment && referenceId(assignment._id) === referenceId(assignmentId) && <>
        <p className="assignment-description">{assignment.description}</p>
        <p>Tổng điểm: {assignment.totalPoints} · Hạn nộp: {dateLabel(assignment.dueDate)}</p>
        {studentView ? <>
          <h4>Bài nộp của bạn</h4>
          {ownSubmissions.length ? ownSubmissions.map((submission, index) =>
            <SubmissionRecord key={submission._id || index} submission={submission} totalPoints={assignment.totalPoints} />)
            : <p>Bạn chưa nộp bài tập này.</p>}
          <form className="assignment-form" aria-label="Nộp bài tập" onSubmit={submitFile}>
            <label>Đường dẫn bài nộp
              <input name="fileUrl" type="url" required placeholder="https://..." disabled={busy || loading}
                value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} />
            </label>
            <p className="assignment-hint">Chỉ nhận đường dẫn HTTP(S), không tải file lên hệ thống. Hãy cấp quyền xem cho giáo viên. Nộp sau hạn được ghi nhận là nộp muộn.</p>
            {ownSubmissions.length > 0 && <p className="assignment-hint">Nộp lại cập nhật đường dẫn và thời gian; không tự xóa điểm hoặc nhận xét đã có.</p>}
            <button className="btn btn-primary" type="submit" disabled={busy || loading}>{busy ? 'Đang gửi...' : ownSubmissions.length ? 'Cập nhật bài nộp' : 'Gửi bài nộp'}</button>
          </form>
        </> : <>
          <h4>Bài nộp của học sinh ({submissions.length})</h4>
          {!submissions.length && <p>Chưa có học sinh nộp bài.</p>}
          <div className="assignment-submissions">
            {submissions.map((submission) => {
              const studentId = referenceId(submission.student);
              const studentName = students.find((student) => referenceId(student) === studentId)?.name
                || submission.student?.name || `Học sinh ${studentId.slice(-6)}`;
              return <article className="assignment-submission-card" key={studentId}>
                <h4>{studentName}</h4>
                <SubmissionRecord submission={submission} totalPoints={assignment.totalPoints} />
                <GradeForm submission={submission} totalPoints={assignment.totalPoints} studentName={studentName} busy={busy || loading}
                  onGrade={(body) => mutate('grade', body, 'Đã lưu điểm bài tập.')} />
              </article>;
            })}
          </div>
        </>}
      </>}
    </>}
  </section>;
}
