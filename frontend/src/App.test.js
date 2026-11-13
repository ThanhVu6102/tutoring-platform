import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import App from './App';

jest.mock('./config/api', () => ({}));
jest.mock('./components/Navbar', () => () => <nav aria-label="Điều hướng chính">Navbar kiểm thử</nav>);
jest.mock('./pages/ProfilePage', () => () => <h1>Hồ sơ chính chủ kiểm thử</h1>);
jest.mock('./pages/LoginPage', () => () => <h1>Đăng nhập kiểm thử</h1>);
jest.mock('./pages/AdminModeration', () => () => <h1>Quản trị tài khoản kiểm thử</h1>);
jest.mock('./pages/Dashboard', () => () => <h1>Trang chủ kiểm thử</h1>);
const act = React.act || legacyAct;
let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.history.replaceState({}, '', '/profile');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

test.each(['admin', 'teacher', 'student'])('vai trò %s đã đăng nhập được mở hồ sơ chính chủ', async (role) => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', role);
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain('Hồ sơ chính chủ kiểm thử');
  expect(window.location.pathname).toBe('/profile');
});

test('không có phiên đăng nhập vẫn bị chuyển khỏi hồ sơ sang đăng nhập', async () => {
  localStorage.setItem('userRole', 'admin');
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain('Đăng nhập kiểm thử');
  expect(container.textContent).not.toContain('Hồ sơ chính chủ kiểm thử');
  expect(window.location.pathname).toBe('/login');
});

test.each(['student', 'teacher'])('vai trò %s không mở được trang xóa tài khoản học sinh', async (role) => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', role);
  window.history.replaceState({}, '', '/admin/moderation');
  await act(async () => root.render(<App />));
  expect(window.location.pathname).toBe('/dashboard');
  expect(container.textContent).not.toContain('Quản trị tài khoản kiểm thử');
});

test.each(['/login', '/register', '/login/?next=profile'])('ẩn navbar trên trang xác thực %s', async (path) => {
  window.history.replaceState({}, '', path);
  await act(async () => root.render(<App />));
  expect(container.querySelector('nav[aria-label="Điều hướng chính"]')).toBeNull();
});

test('ẩn navbar trên trang đăng nhập cả khi phiên cũ còn trong storage', async () => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', 'student');
  window.history.replaceState({}, '', '/login');
  await act(async () => root.render(<App />));
  expect(container.querySelector('nav[aria-label="Điều hướng chính"]')).toBeNull();
});

test('navbar vẫn hiện trên trang khác', async () => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', 'student');
  await act(async () => root.render(<App />));
  expect(container.querySelector('nav[aria-label="Điều hướng chính"]')).not.toBeNull();
});
