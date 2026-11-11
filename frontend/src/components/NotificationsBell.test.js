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
