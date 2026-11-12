import React, { useRef, useState } from 'react';
import axios from 'axios';

const empty = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function ChangePasswordForm() {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);

  // Form độc lập không gửi mật khẩu vào API hồ sơ hoặc lưu trên trình duyệt.
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    setNotice('');
    if (form.newPassword !== form.confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    if (form.newPassword.length < 8 || new Blob([form.newPassword]).size > 72) {
      setError('Mật khẩu mới cần ít nhất 8 ký tự và không vượt quá 72 byte UTF-8.');
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const response = await axios.patch('/api/users/password', {
        currentPassword: form.currentPassword, newPassword: form.newPassword,
      });
      setForm(empty);
      setNotice(response.data.message || 'Đổi mật khẩu thành công.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể đổi mật khẩu, vui lòng thử lại.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <section className="profile-history" aria-labelledby="change-password-title">
    <header><h2 id="change-password-title">Đổi mật khẩu</h2></header>
    <p>Mật khẩu mới từ 8 ký tự, tối đa 72 byte UTF-8. Các phiên đang đăng nhập vẫn có hiệu lực đến khi hết hạn.</p>
    <p>Mọi tài khoản, kể cả quản trị viên, đều có thể đổi mật khẩu bằng mật khẩu hiện tại.</p>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {notice && <div className="tool-notice" role="status">{notice}</div>}
    <form className="profile-form" aria-label="Đổi mật khẩu" onSubmit={submit}>
      {[
        ['currentPassword', 'Mật khẩu hiện tại', 'current-password'],
        ['newPassword', 'Mật khẩu mới', 'new-password'],
        ['confirmPassword', 'Nhập lại mật khẩu mới', 'new-password'],
      ].map(([name, label, autoComplete]) => <label key={name}>{label}
        <input type="password" name={name} autoComplete={autoComplete} required disabled={busy}
          minLength={name === 'currentPassword' ? undefined : 8} value={form[name]}
          onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} />
      </label>)}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu'}</button>
    </form>
  </section>;
}
