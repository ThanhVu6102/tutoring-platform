import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
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
