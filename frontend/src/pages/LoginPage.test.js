import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import LoginPage from './LoginPage';

jest.mock('axios');
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useLocation: () => ({ state: null }),
  Link: ({ children }) => <span>{children}</span> }));
const act = React.act || legacyAct;
let container;
let root;
let onLogin;
beforeEach(async () => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  onLogin = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<LoginPage onLogin={onLogin} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  sessionStorage.clear();
  jest.restoreAllMocks();
});
const password = 'Synthetic-password-not-for-accounts!';
async function submit() {
  act(() => Simulate.change(container.querySelector('input[type="email"]'), { target: { value: 'synthetic@example.test' } }));
  act(() => Simulate.change(container.querySelector('input[placeholder="Nhập mật khẩu"]'), { target: { value: password } }));
  await act(async () => Simulate.submit(container.querySelector('form')));
}

test('đăng nhập sai hiển thị thông báo nhưng không log Axios response/config có mật khẩu', async () => {
  const config = { data: JSON.stringify({ email: 'synthetic@example.test', password }) };
  axios.post.mockRejectedValue({ response: { status: 401, data: { message: 'Email hoặc mật khẩu không đúng' }, config }, config });
  await submit();
  expect(container.textContent).toContain('Email hoặc mật khẩu không đúng');
  expect(container.textContent).not.toContain(password);
  expect(onLogin).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  expect(localStorage.getItem('userId')).toBeNull();
});

test('lỗi mạng không log object lỗi chứa mật khẩu và cho phép thử lại', async () => {
  axios.post.mockRejectedValue({ message: password, config: { data: password } });
  await submit();
  expect(container.textContent).toContain('Không kết nối được tới server backend');
  expect(container.textContent).not.toContain(password);
  expect(console.error).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
});

test.each(['student', 'teacher', 'admin'])('đăng nhập %s thành công giữ luồng điều hướng và không lưu mật khẩu', async (role) => {
  axios.post.mockResolvedValue({ data: { token: 'synthetic-jwt', user: { id: 'synthetic-id', role } } });
  await submit();
  expect(onLogin).toHaveBeenCalledWith('synthetic-jwt', role);
  expect(mockNavigate).toHaveBeenCalledWith(role === 'admin' ? '/admin' : '/dashboard');
  expect(localStorage.getItem('userId')).toBe('synthetic-id');
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(password);
  expect(console.error).not.toHaveBeenCalled();
});
