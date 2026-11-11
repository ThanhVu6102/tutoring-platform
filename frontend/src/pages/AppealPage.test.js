import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import { getAllPages } from '../utils/listRequests';
import AppealPage from './AppealPage';

jest.mock('axios');
jest.mock('../utils/listRequests', () => ({ getAllPages: jest.fn() }));
const act = React.act || legacyAct;

test.each(['student', 'teacher'])('appeal page loads only the current role data for %s', async (role) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('userRole', role);
  axios.get.mockResolvedValue({ data: [{ _id: 'warning-1', status: 'pending',
    class: { name: 'Lớp A' }, appealDeadline: '2099-01-01T00:00:00Z', issuedAt: '2026-01-01T00:00:00Z' }] });
  getAllPages.mockResolvedValue([{ _id: 'class-1', name: 'Lớp B',
    lockNotice: { status: 'pending', appealDeadline: '2099-01-01T00:00:00Z', issuedAt: '2026-01-01T00:00:00Z' } }]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AppealPage />));
    expect(container.querySelector('textarea')).toBeTruthy();
    if (role === 'student') {
      expect(axios.get).toHaveBeenCalledWith('/api/student-warnings/mine');
      expect(getAllPages).not.toHaveBeenCalled();
    } else {
      expect(getAllPages).toHaveBeenCalledWith('/api/classes', { view: 'history' });
      expect(axios.get).not.toHaveBeenCalled();
    }
  } finally { act(() => root.unmount()); container.remove(); localStorage.clear(); jest.clearAllMocks(); }
});

test.each(['student', 'teacher'])('appeal page does not offer a form without a valid deadline for %s', async (role) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('userRole', role);
  axios.get.mockResolvedValue({ data: [{ _id: 'warning-1', status: 'pending', class: { name: 'Lớp A' } }] });
  getAllPages.mockResolvedValue([{ _id: 'class-1', name: 'Lớp B', lockNotice: { status: 'pending' } }]);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AppealPage />));
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toContain('Không có hạn kháng cáo hợp lệ.');
  } finally { act(() => root.unmount()); container.remove(); localStorage.clear(); jest.clearAllMocks(); }
});

test.each(['student', 'teacher'])('appeal page sends one request while a %s appeal is pending', async (role) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('userRole', role);
  axios.get.mockResolvedValue({ data: [{ _id: 'warning-1', status: 'pending',
    class: { name: 'Lớp A' }, appealDeadline: '2099-01-01T00:00:00Z' }] });
  getAllPages.mockResolvedValue([{ _id: 'class-1', name: 'Lớp B',
    lockNotice: { status: 'pending', appealDeadline: '2099-01-01T00:00:00Z' } }]);
  let finish;
  axios.post.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AppealPage />));
    await act(async () => Simulate.change(container.querySelector('textarea'), { target: { value: 'Giải trình hợp lệ' } }));
    const form = container.querySelector('form.appeal-form');
    act(() => { Simulate.submit(form); Simulate.submit(form); });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(role === 'student'
      ? '/api/student-warnings/warning-1/appeal' : '/api/classes/class-1/lock-appeal', { message: 'Giải trình hợp lệ' });
    expect(form.querySelector('button').disabled).toBe(true);
    await act(async () => finish({ data: {} }));
    expect(container.textContent).toContain('đã được gửi tới quản trị viên');
  } finally { act(() => root.unmount()); container.remove(); localStorage.clear(); jest.clearAllMocks(); }
});
