import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import usePagedList from '../hooks/usePagedList';
import useDebouncedValue from '../hooks/useDebouncedValue';
import Pagination from '../components/Pagination';
import './AdminAccounts.css';

const roleLabels = { student: 'Học sinh', teacher: 'Giáo viên', admin: 'Quản trị viên' };
const statusLabels = { pending: 'Chờ duyệt', active: 'Đang hoạt động', inactive: 'Tạm nghỉ', left: 'Đã rời trung tâm', rejected: 'Bị từ chối' };
const denied = (status) => [401, 403, 423].includes(status);
const safeError = (status, fallback) => ({
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền quản lý tài khoản.',
  423: 'Tài khoản của bạn đang bị hạn chế truy cập.',
  409: 'Hồ sơ đã được xử lý hoặc không còn chờ duyệt. Danh sách đã được tải lại.',
}[status] || fallback);

export default function AdminAccounts() {
  // Khóa trang theo phiên lúc mở; không hiển thị dữ liệu admin cũ cho phiên mới.
  const [session] = useState(() => ({ token: localStorage.getItem('token'), id: localStorage.getItem('userId') }));
  const [invalidSession, setInvalidSession] = useState(false);
  const sessionMatches = () => Boolean(session.token && session.id)
    && localStorage.getItem('token') === session.token && localStorage.getItem('userId') === session.id
    && localStorage.getItem('userRole') === 'admin';
  const allowed = sessionMatches() && !invalidSession;
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const list = usePagedList(allowed ? '/api/users' : null,
    { search: debouncedSearch, role, status, view: 'moderation' }, allowed);
  const [selection, setSelection] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(false);
  const reviewHeading = useRef(null);
  const opener = useRef(null);
  const forbidden = denied(list.errorStatus) && Boolean(list.error);

  useEffect(() => {
    mounted.current = true;
    const check = () => {
      if (localStorage.getItem('token') !== session.token || localStorage.getItem('userId') !== session.id
        || localStorage.getItem('userRole') !== 'admin') setInvalidSession(true);
    };
    window.addEventListener('storage', check);
    window.addEventListener('focus', check);
    return () => {
      mounted.current = false;
      window.removeEventListener('storage', check);
      window.removeEventListener('focus', check);
    };
  }, [session]);
  useEffect(() => { if (selection) reviewHeading.current?.focus(); }, [selection]);

  const closeReview = () => {
    setSelection(null);
    setNote('');
    if (opener.current?.isConnected) opener.current.focus();
  };
  const changeFilter = (setter, value) => {
    if (pending.current) return;
    // Xóa bộ lọc quay về trang 1 kể cả khi key tìm kiếm cũ từng ở trang sau.
    list.setPage(1);
    setter(value);
    closeReview();
    setError('');
    setNotice('');
  };
  const startReview = (account, decision, event) => {
    if (!sessionMatches() || pending.current || list.loading || list.error) return;
    opener.current = event.currentTarget;
    setSelection({ account, decision });
    setNote('');
    setError('');
    setNotice('');
  };
  const review = async (event) => {
    event.preventDefault();
    if (pending.current || !selection || !sessionMatches() || forbidden || list.loading || list.error) return;
    if (note.length > 2000) { setError('Ghi chú tối đa 2000 ký tự.'); return; }
    // Chỉ gửi dữ liệu đúng contract: approve không có ghi chú, reject nhận note tùy chọn.
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await axios.put(`/api/users/${selection.account._id}/${selection.decision}`,
        selection.decision === 'reject' ? { note } : {});
      if (!mounted.current || !sessionMatches()) return;
      setNotice(selection.decision === 'approve' ? 'Đã duyệt hồ sơ giáo viên.' : 'Đã từ chối hồ sơ giáo viên.');
      closeReview();
      list.reload();
    } catch (requestError) {
      if (!mounted.current || !sessionMatches()) return;
      const code = requestError.response?.status;
      setError(safeError(code, code === 400 ? 'Dữ liệu xét duyệt không hợp lệ. Ghi chú tối đa 2000 ký tự.'
        : 'Không thể xác nhận kết quả xét duyệt. Hãy tải lại danh sách trước khi thử lại; ghi chú vẫn được giữ.'));
      if (denied(code)) setInvalidSession(true);
      // Không gửi lại mutation khi có xung đột hoặc lỗi không rõ đã ghi hay chưa.
      if (code === 409) closeReview();
      list.reload();
    } finally {
      pending.current = false;
      if (mounted.current && sessionMatches()) setBusy(false);
    }
  };
  const pagination = { ...list, error: list.error ? safeError(list.errorStatus, 'Không tải được danh sách tài khoản. Vui lòng thử lại.') : '',
    loading: list.loading || busy, setPage: (page) => { closeReview(); list.setPage(page); } };

  if (!allowed) return <main className="admin-page"><h1>Quản lý tài khoản</h1>
    <p role="alert">Phiên đăng nhập đã thay đổi hoặc không có quyền quản trị. Vui lòng đăng nhập lại và mở lại trang.</p></main>;

  return <main className="admin-page admin-accounts">
    <header className="admin-heading"><div><p className="admin-eyebrow">KHÔNG GIAN QUẢN TRỊ</p>
      <h1>Quản lý tài khoản</h1><p className="admin-intro">Tra cứu vai trò, trạng thái và duyệt hồ sơ giáo viên đang chờ.</p></div></header>
    {notice && <p className="tool-notice" role="status">{notice}</p>}
    {error && <p className="admin-alert" role="alert">{error}</p>}
    <fieldset className="admin-filter-bar accounts-filters" disabled={busy}>
      <legend>Bộ lọc tài khoản</legend>
      <label>Tìm tên hoặc email<input type="search" value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} /></label>
      <div><label htmlFor="account-role-filter">Vai trò</label><select id="account-role-filter" value={role} onChange={(event) => changeFilter(setRole, event.target.value)}>
        <option value="">Tất cả vai trò</option>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
      <div><label htmlFor="account-status-filter">Trạng thái</label><select id="account-status-filter" value={status} onChange={(event) => changeFilter(setStatus, event.target.value)}>
        <option value="">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
      <button className="btn btn-secondary" type="button" onClick={() => {
        changeFilter(setSearch, ''); setRole(''); setStatus('');
      }}>Xóa bộ lọc</button>
    </fieldset>
    <Pagination list={pagination} label="tài khoản" />
    {list.loading && <p role="status">Đang tải danh sách tài khoản...</p>}
    {!list.loading && !list.error && list.data.length === 0 && <p className="admin-state">
      {search || role || status ? 'Không có tài khoản phù hợp bộ lọc.' : 'Chưa có tài khoản nào trong hệ thống.'}</p>}
    {!forbidden && <section className="accounts-grid" aria-label="Danh sách tài khoản" aria-busy={list.loading || busy}>
      {list.data.map((account) => <article className="account-card" key={account._id}>
        <h2>{account.name || 'Chưa có tên'}</h2><p className="account-email">{account.email}</p>
        <dl><div><dt>Vai trò</dt><dd>{roleLabels[account.role] || 'Không xác định'}</dd></div>
          <div><dt>Trạng thái</dt><dd>{statusLabels[account.status || 'active'] || 'Không xác định'}</dd></div>
          <div><dt>Truy cập</dt><dd>{account.permanentlyBanned ? 'Khóa vĩnh viễn' : account.isBlocked ? 'Đã khóa đăng nhập'
            : account.suspendedUntil && new Date(account.suspendedUntil) > new Date() ? 'Đang đình chỉ' : 'Không bị khóa'}</dd></div></dl>
        {account.role === 'teacher' && account.status === 'pending' && <div className="account-actions">
          <button className="btn btn-primary" type="button" disabled={busy || list.loading || Boolean(list.error)}
            onClick={(event) => startReview(account, 'approve', event)}>Duyệt giáo viên</button>
          <button className="btn btn-secondary" type="button" disabled={busy || list.loading || Boolean(list.error)}
            onClick={(event) => startReview(account, 'reject', event)}>Từ chối giáo viên</button>
        </div>}
      </article>)}
    </section>}
    {selection && !forbidden && <section className="account-review card" aria-labelledby="account-review-title">
      <h2 ref={reviewHeading} tabIndex="-1" id="account-review-title">{selection.decision === 'approve' ? 'Xác nhận duyệt giáo viên' : 'Xác nhận từ chối giáo viên'}</h2>
      <p>{selection.account.name} — {selection.account.email}</p>
      <p>{selection.decision === 'approve' ? 'Hồ sơ chuyển sang đang hoạt động; các hạn chế truy cập khác (nếu có) vẫn được giữ nguyên.'
        : 'Hồ sơ chuyển sang bị từ chối và không được đăng nhập. Thao tác này không xóa tài khoản.'}</p>
      <form aria-label="Xét duyệt giáo viên" onSubmit={review}>
        {selection.decision === 'reject' && <><label htmlFor="teacher-review-note">Lý do từ chối (không bắt buộc)</label>
          <textarea id="teacher-review-note" value={note} maxLength={2000} rows={3} disabled={busy}
            onChange={(event) => setNote(event.target.value)} /><small>{note.length}/2000 ký tự</small></>}
        <div className="account-actions"><button className="btn btn-primary" disabled={busy || list.loading || Boolean(list.error)} type="submit">
          {busy ? 'Đang xử lý...' : selection.decision === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}</button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={closeReview}>Hủy</button></div>
      </form>
    </section>}
  </main>;
}
