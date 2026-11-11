import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import axios from 'axios';
import { getAllPages } from '../utils/listRequests';
import AdminModeration from './AdminModeration';

jest.mock('axios');
jest.mock('../utils/listRequests', () => ({ getAllPages: jest.fn() }));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
const act = React.act || legacyAct;

test('admin cancels or completes soft deletion of a student account', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  getAllPages.mockImplementation((url) => Promise.resolve(url === '/api/users' ? [
    { _id: 'student-1', name: 'Học sinh A', email: 'student@example.test' },
  ] : []));
  axios.get.mockResolvedValue({ data: [] });
  axios.delete.mockResolvedValue({ data: { message: 'Đã xóa người dùng' } });
  const confirm = jest.spyOn(window, 'confirm');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminModeration />));
    await act(async () => [...container.querySelectorAll('[role="tab"]')].find((node) => node.textContent === 'Tài khoản học sinh').click());
    const deleteButton = [...container.querySelectorAll('button')].find((node) => node.textContent === 'Xóa tài khoản');
    confirm.mockReturnValueOnce(false);
    await act(async () => deleteButton.click());
    expect(axios.delete).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    await act(async () => deleteButton.click());
    expect(axios.delete).toHaveBeenCalledWith('/api/users/student-1');
    expect(container.textContent).toContain('Đã xóa tài khoản Học sinh A.');
  } finally { confirm.mockRestore(); act(() => root.unmount()); container.remove(); jest.clearAllMocks(); }
});

test('hiding a warning only changes the current admin view and persists after reload', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem('userId', 'admin-a');
  getAllPages.mockResolvedValue([]);
  axios.get.mockResolvedValue({ data: [{ _id: 'warning-1', status: 'pending',
    student: { name: 'Học sinh A' }, class: { name: 'Lớp A' },
    issuedAt: '2026-01-01T00:00:00Z', appealDeadline: '2099-01-01T00:00:00Z' }] });
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);
  try {
    await act(async () => root.render(<AdminModeration />));
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Ẩn thông báo').click());
    expect(container.querySelector('.admin-warning-card')).toBeNull();
    expect(axios.patch).not.toHaveBeenCalled();
    expect(localStorage.getItem('admin-hidden-warnings:admin-a')).toContain('warning-1');
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<AdminModeration />));
    expect(container.querySelector('.admin-warning-card')).toBeNull();
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Hiện 1 thông báo')).click());
    expect(container.querySelector('.admin-warning-card')).toBeTruthy();
  } finally { act(() => root.unmount()); container.remove(); localStorage.clear(); jest.clearAllMocks(); }
});
