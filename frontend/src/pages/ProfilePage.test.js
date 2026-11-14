import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProfilePage from './ProfilePage';

jest.mock('axios');
const act = React.act || legacyAct;
let container;
let root;
const renderProfile = (key) => root.render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <ProfilePage key={key} />
  </MemoryRouter>
);
beforeEach(async () => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('userRole', 'student');
  axios.get.mockImplementation(async (url) => ({ data: url === '/api/users/profile'
    ? { name: 'Học sinh test', email: 'test@example.test', phone: '', bio: '' }
    : url === '/api/classes' ? { data: [], page: 1, totalPages: 1 } : [] }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => renderProfile());
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

function fill(confirmPassword = 'New-password!') {
  if (!passwordForm()) selectSection('password');
  for (const [name, value] of Object.entries({ currentPassword: 'Old-password!', newPassword: 'New-password!', confirmPassword })) {
    act(() => Simulate.change(container.querySelector(`input[name="${name}"]`), { target: { value } }));
  }
}
const passwordForm = () => container.querySelector('form[aria-label="Đổi mật khẩu"]');
const selectSection = (id) => act(() => container.querySelector(`#profile-menu-${id}`).click());

test('profile renders independent accessible password fields and rejects mismatched confirmation', async () => {
  expect(container.querySelector('form input').value).toBe('Học sinh test');
  expect(container.textContent).not.toContain('Tài khoản quản trị được quản lý bằng cấu hình');
  selectSection('password');
  expect(container.querySelector('input[name="currentPassword"]').autocomplete).toBe('current-password');
  expect(container.querySelector('input[name="newPassword"]').type).toBe('password');
  fill('Not matching!');
  await act(async () => Simulate.submit(passwordForm()));
  expect(container.textContent).toContain('Mật khẩu nhập lại không khớp.');
  expect(axios.patch).not.toHaveBeenCalled();
});

test('hồ sơ admin cho phép đổi mật khẩu và không hiện hạn chế cấu hình đã bỏ', async () => {
  localStorage.setItem('userRole', 'admin');
  await act(async () => renderProfile());
  expect(container.textContent).toContain('Quản lý hồ sơ và mật khẩu tài khoản quản trị của bạn.');
  selectSection('password');
  expect(container.textContent).toContain('Mọi tài khoản, kể cả quản trị viên, đều có thể đổi mật khẩu');
  expect(container.textContent).not.toContain('không thể đổi mật khẩu tại đây');
  expect(passwordForm()).not.toBeNull();
  expect(container.textContent).not.toContain('Lịch sử cảnh báo');
});

test('password change sends only required fields, blocks duplicates and clears fields after success', async () => {
  let resolve;
  axios.patch.mockReturnValue(new Promise((done) => { resolve = done; }));
  fill();
  act(() => {
    Simulate.submit(passwordForm());
    Simulate.submit(passwordForm());
  });
  expect(axios.patch).toHaveBeenCalledTimes(1);
  expect(axios.patch).toHaveBeenCalledWith('/api/users/password', { currentPassword: 'Old-password!', newPassword: 'New-password!' });
  expect(passwordForm().querySelector('button').disabled).toBe(true);
  await act(async () => resolve({ data: { message: 'Đổi mật khẩu thành công.' } }));
  for (const input of passwordForm().querySelectorAll('input')) expect(input.value).toBe('');
  expect(container.textContent).toContain('Đổi mật khẩu thành công.');
  expect(localStorage.getItem('newPassword')).toBeNull();
  expect(axios.put).not.toHaveBeenCalled();
});

test('password API errors remain visible and profile saving still works independently', async () => {
  axios.patch.mockRejectedValue({ response: { data: { message: 'Mật khẩu hiện tại không đúng' } } });
  fill();
  await act(async () => Simulate.submit(passwordForm()));
  expect(container.querySelector('[role="alert"]').textContent).toBe('Mật khẩu hiện tại không đúng');
  expect(passwordForm().querySelector('button').disabled).toBe(false);
  axios.put.mockResolvedValue({ data: { user: { name: 'Tên mới' } } });
  selectSection('personal');
  const profileForm = container.querySelector('form');
  await act(async () => Simulate.submit(profileForm));
  expect(axios.put).toHaveBeenCalledWith('/api/users/profile', expect.not.objectContaining({ currentPassword: expect.anything() }));
  expect(container.textContent).toContain('Thông tin cá nhân đã được cập nhật.');
});

test('rejects new passwords shorter than eight characters or over 72 UTF-8 bytes', async () => {
  for (const value of ['12345', 'é'.repeat(37)]) {
    fill();
    for (const name of ['newPassword', 'confirmPassword']) {
      act(() => Simulate.change(container.querySelector(`input[name="${name}"]`), { target: { value } }));
    }
    await act(async () => Simulate.submit(passwordForm()));
    expect(container.textContent).toContain('không vượt quá 72 byte UTF-8');
  }
  expect(axios.patch).not.toHaveBeenCalled();
});

test('quản trị viên đổi mật khẩu chính chủ mà không tải lịch sử cảnh báo học sinh hoặc giáo viên', async () => {
  localStorage.setItem('userRole', 'admin');
  axios.get.mockClear();
  axios.get.mockResolvedValue({ data: { name: 'Quản trị viên kiểm thử', email: 'admin@example.test', role: 'admin' } });
  await act(async () => renderProfile('admin'));
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(axios.get).toHaveBeenCalledWith('/api/users/profile');
  expect(container.textContent).toContain('Quản lý hồ sơ và mật khẩu tài khoản quản trị của bạn.');
  expect(container.textContent).not.toContain('Lịch sử cảnh báo');
  expect(container.textContent).not.toContain('không thể đổi mật khẩu');
  selectSection('password');
  expect(passwordForm()).not.toBeNull();
  axios.patch.mockResolvedValue({ data: { message: 'Đổi mật khẩu thành công.' } });
  fill();
  await act(async () => Simulate.submit(passwordForm()));
  expect(axios.patch).toHaveBeenCalledWith('/api/users/password', {
    currentPassword: 'Old-password!', newPassword: 'New-password!',
  });
  expect(container.textContent).toContain('Đổi mật khẩu thành công.');
  expect(axios.put).not.toHaveBeenCalled();
});

test.each(['student', 'teacher'])('%s can open appeals from their personal profile', async (role) => {
  localStorage.setItem('userRole', role);
  await act(async () => root.render(
    <MemoryRouter key={role} initialEntries={['/profile']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/appeals" element={<h1>Appeals destination</h1>} />
      </Routes>
    </MemoryRouter>
  ));
  selectSection('appeals');
  const section = container.querySelector('section[aria-labelledby="profile-appeals-title"]');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(section).not.toBeNull();
  expect(section.textContent).toContain(role === 'teacher' ? 'thông báo khóa lớp' : 'cảnh báo vi phạm');
  const link = section.querySelector('a');
  expect(link.getAttribute('href')).toBe('/appeals');
  await act(async () => link.click());
  expect(container.textContent).toBe('Appeals destination');
});

test('admin profile does not expose the teacher and student appeals entry', async () => {
  localStorage.setItem('userRole', 'admin');
  await act(async () => renderProfile('admin'));
  expect(container.querySelector('.profile-appeals')).toBeNull();
  expect(container.querySelector('a[href="/appeals"]')).toBeNull();
  expect(container.querySelector('#profile-menu-appeals')).toBeNull();
  expect(container.querySelector('#profile-menu-history')).toBeNull();
});

test.each(['student', 'teacher'])('%s profile shows only the selected section and preserves unsaved personal details', async (role) => {
  localStorage.setItem('userRole', role);
  await act(async () => renderProfile(role));
  const nav = container.querySelector('nav[aria-label="Các mục hồ sơ cá nhân"]');
  expect(nav.querySelectorAll('button')).toHaveLength(4);
  expect(nav.querySelector('[aria-current="page"]').id).toBe('profile-menu-personal');
  expect(container.querySelector('.profile-editor')).not.toBeNull();
  expect(passwordForm()).toBeNull();
  expect(container.querySelector('.profile-appeals')).toBeNull();
  expect(container.querySelector('.profile-history')).toBeNull();
  act(() => Simulate.change(container.querySelector('.profile-form input'), { target: { value: 'Tên đang chỉnh sửa' } }));
  selectSection('password');
  expect(passwordForm()).not.toBeNull();
  expect(container.querySelector('.profile-editor')).toBeNull();
  expect(container.querySelector('#profile-panel').getAttribute('aria-labelledby')).toBe('profile-menu-password');
  selectSection('history');
  expect(passwordForm()).toBeNull();
  expect(container.querySelector('.profile-history').textContent).toContain(role === 'teacher'
    ? 'Chưa có thông báo xử lý lớp học.' : 'Bạn chưa nhận cảnh báo nào.');
  selectSection('personal');
  expect(container.querySelector('.profile-form input').value).toBe('Tên đang chỉnh sửa');
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(axios.put).not.toHaveBeenCalled();
});
