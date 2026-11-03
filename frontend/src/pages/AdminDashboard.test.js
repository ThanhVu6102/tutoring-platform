import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import axios from 'axios';
import AdminDashboard from './AdminDashboard';

jest.mock('axios');
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
const act = React.act || legacyAct;

// Tổng phải lấy từ toàn bộ filter phía server, không biến một trang thành tổng hệ thống.
test('shows server totals and studentCount without loading the class roster', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('token', 'admin-test-token');
  axios.get.mockResolvedValue({ data: { data: [{ _id: 'class-a', name: 'Lớp A',
    teacher: { _id: 'teacher-a', name: 'Giáo viên A' }, studentCount: 125 }],
  page: 1, limit: 20, total: 42, totalPages: 3, summary: { total: 42, active: 40, inactive: 2 } } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminDashboard />));
    expect([...container.querySelectorAll('.admin-summary strong')].map((node) => node.textContent))
      .toEqual(['42', '40', '2']);
    expect(container.textContent).toContain('125 học sinh');
    expect(axios.get).toHaveBeenCalledWith('/api/classes', expect.objectContaining({
      params: expect.objectContaining({ page: 1, limit: 20, summary: 'true' }),
    }));
  } finally {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  }
});
