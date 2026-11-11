import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import App from './App';

jest.mock('./config/api', () => ({}));
jest.mock('./components/Navbar', () => () => null);
jest.mock('./pages/ProfilePage', () => () => <h1>Hồ sơ chính chủ kiểm thử</h1>);
jest.mock('./pages/LoginPage', () => () => <h1>Đăng nhập kiểm thử</h1>);
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
