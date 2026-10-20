import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { lockStatusLabels, policyReasonLabels } from '../config/policyLabels';

const warningStatusLabels = {
  pending: 'Chờ kháng cáo',
  appealed: 'Đã gửi kháng cáo',
  confirmed: 'Đã xác nhận vi phạm',
  dismissed: 'Đã gỡ cảnh báo',
};

const ProfilePage = () => {
  const role = localStorage.getItem('userRole');
  const [profile, setProfile] = useState(null);
  const [classes, setClasses] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', bio: '', avatar: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const requests = [axios.get('/api/users/profile')];
        if (role === 'student') requests.push(axios.get('/api/student-warnings/mine'));
        if (role === 'teacher') requests.push(axios.get('/api/classes'));
        const responses = await Promise.all(requests);
        const user = responses[0].data;
        setProfile(user);
        setForm({ name: user.name || '', phone: user.phone || '', bio: user.bio || '', avatar: user.avatar || '' });
        if (role === 'student') setWarnings(responses[1].data);
        if (role === 'teacher') setClasses(responses[1].data);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Không tải được hồ sơ cá nhân.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [role]);

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Ảnh đại diện cần ở định dạng PNG, JPG hoặc WebP.');
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ảnh đại diện không được lớn hơn 2 MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, avatar: reader.result }));
      setError('');
    };
    reader.onerror = () => setError('Không đọc được ảnh đại diện.');
    reader.readAsDataURL(file);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await axios.put('/api/users/profile', form);
      setProfile((current) => ({ ...current, ...response.data.user }));
      setNotice('Thông tin cá nhân đã được cập nhật.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể lưu hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  const teacherLockHistory = classes.flatMap((classItem) => {
    const notices = (classItem.lockNoticeHistory || []).map((item) => ({ ...item, classItem }));
    if (classItem.lockNotice?.status && classItem.lockNotice.status !== 'none') {
      notices.push({ ...classItem.lockNotice, classItem });
    }
    return notices;
  }).sort((first, second) => new Date(second.issuedAt || second.resolvedAt) - new Date(first.issuedAt || first.resolvedAt));

  if (loading) return <main className="main-content"><p role="status">Đang tải hồ sơ cá nhân...</p></main>;

  return (
    <main className="profile-page">
      <header className="profile-heading">
        <p className="admin-eyebrow">TÀI KHOẢN</p>
        <h1>Thông tin cá nhân</h1>
        <p>{role === 'teacher' ? 'Quản lý hồ sơ giáo viên và xem lịch sử xử lý lớp học.' : 'Quản lý hồ sơ học sinh và xem lịch sử cảnh báo.'}</p>
      </header>

      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="tool-notice" role="status">{notice}</div>}

      <section className="profile-editor">
        <div className="profile-avatar-column">
          <img className="profile-avatar-preview" src={form.avatar || '/centerlogo.png'} alt="Ảnh đại diện" />
          <label className="avatar-upload-button">
            Đổi ảnh đại diện
            <input accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} type="file" />
          </label>
          {form.avatar && <button className="profile-remove-avatar" onClick={() => setForm({ ...form, avatar: '' })} type="button">Xóa ảnh</button>}
          <small>PNG, JPG hoặc WebP · tối đa 2 MB</small>
        </div>
        <form className="profile-form" onSubmit={handleSave}>
          <label>Họ và tên<input onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label>
          <label>Email<input disabled value={profile?.email || ''} /></label>
          <label>Số điện thoại<input onChange={(event) => setForm({ ...form, phone: event.target.value })} value={form.phone} /></label>
          <label>Giới thiệu<textarea onChange={(event) => setForm({ ...form, bio: event.target.value })} rows="4" value={form.bio} /></label>
          <button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Đang lưu...' : 'Lưu hồ sơ'}</button>
        </form>
      </section>

      <section className="profile-history">
        <header><h2>{role === 'teacher' ? 'Lịch sử thông báo về lớp' : 'Lịch sử cảnh báo'}</h2></header>
        {role === 'student' && warnings.length === 0 && <p className="admin-state">Bạn chưa nhận cảnh báo nào.</p>}
        {role === 'student' && warnings.map((warning) => (
          <article className={`profile-history-record ${warning.status === 'dismissed' ? 'is-dismissed' : ''}`} key={warning._id}>
            <div className="profile-record-heading">
              <div><strong>{warning.class?.name || 'Lớp học'}</strong><span>{new Date(warning.issuedAt).toLocaleString('vi-VN')} · Mức {warning.policyLevel}</span></div>
              <span className={`status-indicator ${warning.status === 'dismissed' ? '' : ['pending', 'appealed'].includes(warning.status) ? 'is-locked' : ''}`}>{warningStatusLabels[warning.status] || warning.status}</span>
            </div>
            <p><strong>{policyReasonLabels[warning.reasonCode] || warning.reasonCode}:</strong> {warning.details}</p>
            {warning.appealMessage && <p><strong>Kháng cáo:</strong> {warning.appealMessage}</p>}
            {warning.adminResponse && <p><strong>Phản hồi Admin:</strong> {warning.adminResponse}</p>}
            {warning.violationCounted && <small>Đã tính {warning.classWarningCount}/3 cảnh báo trong lớp.</small>}
            {warning.accountSanction && <small>Chế tài: {warning.accountSanction}</small>}
          </article>
        ))}

        {role === 'teacher' && teacherLockHistory.length === 0 && <p className="admin-state">Chưa có thông báo xử lý lớp học.</p>}
        {role === 'teacher' && teacherLockHistory.map((item, index) => (
          <article className={`profile-history-record ${item.status === 'dismissed' ? 'is-dismissed' : ''}`} key={`${item.classItem._id}-${item.issuedAt || item.resolvedAt}-${index}`}>
            <div className="profile-record-heading">
              <div><strong>{item.classItem.name}</strong><span>{item.issuedAt ? new Date(item.issuedAt).toLocaleString('vi-VN') : '—'} · Mức {item.policyLevel || '—'}</span></div>
              <span className={`status-indicator ${item.status === 'dismissed' ? '' : 'is-locked'}`}>{lockStatusLabels[item.status] || item.status}</span>
            </div>
            <p><strong>{policyReasonLabels[item.reasonCode] || item.reasonCode || 'Thông báo xử lý lớp'}:</strong> {item.details || '—'}</p>
            {item.appealMessage && <p><strong>Kháng cáo:</strong> {item.appealMessage}</p>}
            {item.adminResponse && <p><strong>Phản hồi Admin:</strong> {item.adminResponse}</p>}
          </article>
        ))}
      </section>
    </main>
  );
};

export default ProfilePage;