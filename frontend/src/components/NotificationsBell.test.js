import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import axios from 'axios';
import NotificationsBell from './NotificationsBell';

jest.mock('axios');
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
const act = React.act || legacyAct;

test.each([
  [true, 'Cảnh báo học sinh'],
  [false, 'Không tải được thông báo'],
])('bell distinguishes loaded warnings from request failure', async (succeeds, expected) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('userId', 'student-a');
  if (succeeds) axios.get.mockResolvedValue({ data: [{ _id: 'warning-1', status: 'pending',
    reasonCode: 'other', details: 'Nội dung cảnh báo' }] });
  else axios.get.mockRejectedValue(new Error('offline'));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<NotificationsBell userRole="student" />));
    await act(async () => container.querySelector('.notification-bell-button').click());
    expect(container.textContent).toContain(expected);
    if (!succeeds) expect(container.textContent).not.toContain('Bạn chưa có thông báo mới.');
  } finally { act(() => root.unmount()); container.remove(); localStorage.clear(); jest.clearAllMocks(); }
});

test('open panel closes on route change without refetching notifications', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('userId', 'student-a');
  axios.get.mockResolvedValue({ data: [{ _id: 'warning-1', status: 'pending', reasonCode: 'other', details: 'Nội dung cảnh báo' }] });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<NotificationsBell userRole="student" pathname="/dashboard" />));
    await act(async () => container.querySelector('.notification-bell-button').click());
    expect(container.querySelector('.notification-popover')).toBeTruthy();
    await act(async () => root.render(<NotificationsBell userRole="student" pathname="/profile" />));
    expect(container.querySelector('.notification-popover')).toBeNull();
    expect(axios.get).toHaveBeenCalledTimes(1);
  } finally { act(() => root.unmount()); container.remove(); localStorage.clear(); jest.clearAllMocks(); }
});

test('opening the bell marks only the current account notification as read', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('userId', 'student-a');
  axios.get.mockResolvedValue({ data: [{ _id: 'warning-1', status: 'pending', reasonCode: 'other', details: 'Nội dung cảnh báo' }] });
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);
  try {
    await act(async () => root.render(<NotificationsBell userRole="student" />));
    expect(container.querySelector('.notification-bell-button').getAttribute('aria-label')).toContain('1 chưa đọc');
    await act(async () => container.querySelector('.notification-bell-button').click());
    expect(container.querySelector('.notification-bell-button').getAttribute('aria-label')).toBe('Thông báo');
    expect(JSON.parse(localStorage.getItem('read-role-notifications:student-a'))).toEqual(['warning-1']);
    act(() => root.unmount());
    localStorage.setItem('userId', 'student-b');
    root = createRoot(container);
    await act(async () => root.render(<NotificationsBell userRole="student" />));
    expect(container.querySelector('.notification-bell-button').getAttribute('aria-label')).toContain('1 chưa đọc');
  } finally { act(() => root.unmount()); container.remove(); localStorage.clear(); jest.clearAllMocks(); }
});
