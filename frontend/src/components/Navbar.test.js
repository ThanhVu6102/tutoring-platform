import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from './Navbar';

jest.mock('axios');
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn(), useLocation: jest.fn() }));
jest.mock('./NotificationsBell', () => () => <span>Chuông</span>);
const act = React.act || legacyAct;

// Logo tối ưu phải được dùng cho mọi vai trò, không tải trễ ảnh thương hiệu.
test.each([
  [null, false, '/logo1.webp'],
  ['admin', true, '/logo1.webp'],
  ['teacher', true, '/GiaoVienLogo.webp'],
  ['student', true, '/HocSinhLogo.webp'],
])('logo WebP đúng cho vai trò %s', async (role, authenticated, source) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  useLocation.mockReturnValue({ pathname: '/dashboard' });
  useNavigate.mockReturnValue(jest.fn());
  axios.get.mockResolvedValue({ data: { name: 'An', avatar: '' } });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Navbar userRole={role} isAuthenticated={authenticated} onLogout={jest.fn()} />));
    const logo = container.querySelector('img[alt="Eklasses"]');
    expect(logo.getAttribute('src')).toBe(source);
    expect(logo.getAttribute('loading')).not.toBe('lazy');
    expect(container.querySelector('.nav-decor img').getAttribute('src')).toBe('/centerlogo.webp');
  } finally { act(() => root.unmount()); jest.clearAllMocks(); }
});

test('mobile menu exposes its state and closes after navigation; profile falls back to initial', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  useLocation.mockReturnValue({ pathname: '/dashboard' });
  const navigate = jest.fn();
  useNavigate.mockReturnValue(navigate);
  axios.get.mockResolvedValue({ data: { name: 'An', avatar: '' } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Navbar userRole="student" isAuthenticated onLogout={jest.fn()} />));
    expect(container.querySelector('.navbar-avatar').textContent).toBe('A');
    const toggle = container.querySelector('.navbar-menu-toggle');
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await act(async () => [...container.querySelectorAll('#navbar-actions button')].find((button) => button.textContent === 'Trang chủ').click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
    await act(async () => container.querySelector('.navbar-avatar').click());
    expect(navigate).toHaveBeenCalledWith('/profile');
  } finally { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); }
});

test('avatar falls back after image error and refreshes when the profile changes', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  useLocation.mockReturnValue({ pathname: '/dashboard' });
  useNavigate.mockReturnValue(jest.fn());
  let profile = { name: 'An', avatar: '/broken-avatar.png' };
  axios.get.mockImplementation(async () => ({ data: profile }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Navbar userRole="student" isAuthenticated onLogout={jest.fn()} />));
    expect(container.querySelector('.navbar-avatar img').getAttribute('src')).toBe('/broken-avatar.png');
    await act(async () => Simulate.error(container.querySelector('.navbar-avatar img')));
    expect(container.querySelector('.navbar-avatar').textContent).toBe('A');
    profile = { name: 'Bình', avatar: '/new-avatar.png' };
    await act(async () => window.dispatchEvent(new Event('eklasses:profile-updated')));
    expect(container.querySelector('.navbar-avatar img').getAttribute('src')).toBe('/new-avatar.png');
    profile = { name: '', avatar: '' };
    await act(async () => window.dispatchEvent(new Event('eklasses:profile-updated')));
    expect(container.querySelector('.navbar-avatar').textContent).toBe('?');
  } finally { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); }
});

test('quản trị viên mở được hồ sơ và mật khẩu từ menu trên máy tính hoặc di động', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  useLocation.mockReturnValue({ pathname: '/admin' });
  const navigate = jest.fn();
  useNavigate.mockReturnValue(navigate);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Navbar userRole="admin" isAuthenticated onLogout={jest.fn()} />));
    const toggle = container.querySelector('.navbar-menu-toggle');
    await act(async () => toggle.click());
    const profileButton = [...container.querySelectorAll('#navbar-actions button')]
      .find((button) => button.textContent === 'Hồ sơ và mật khẩu');
    expect(profileButton).toBeDefined();
    await act(async () => profileButton.click());
    expect(navigate).toHaveBeenCalledWith('/profile');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('Quản trị lớp');
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Quản lý tài khoản').click());
    expect(navigate).toHaveBeenCalledWith('/admin/accounts');
  } finally { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); }
});
