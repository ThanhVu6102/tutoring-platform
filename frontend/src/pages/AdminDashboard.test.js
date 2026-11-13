import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import AdminDashboard from './AdminDashboard';

jest.mock('axios');
const act = React.act || legacyAct;

beforeEach(() => {
  window.history.replaceState({}, '', '/admin');
  axios.get.mockReset();
});

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
    await act(async () => root.render(<BrowserRouter><AdminDashboard /></BrowserRouter>));
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

test('restores URL filters and clears them without changing the API contract', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, '', '/admin?q=algebra&subject=Math&grade=10&status=active&teacher=teacher%40example.test&sort=name_asc');
  localStorage.setItem('token', 'admin-test-token');
  axios.get.mockResolvedValue({ data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0,
    summary: { total: 0, active: 0, inactive: 0 } } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BrowserRouter><AdminDashboard /></BrowserRouter>));
    expect([...container.querySelectorAll('.admin-filter-bar input, .admin-filter-bar select')].map((node) => node.value))
      .toEqual(['algebra', 'Math', '10', 'active', 'teacher@example.test', 'name_asc']);
    expect(axios.get).toHaveBeenCalledWith('/api/classes', expect.objectContaining({
      params: expect.objectContaining({ q: 'algebra', subject: 'Math', grade: '10', status: 'active',
        teacher: 'teacher@example.test', sort: 'name_asc' }),
    }));
    expect(container.textContent).toContain('Không có lớp phù hợp bộ lọc.');
    await act(async () => container.querySelector('.admin-filter-bar button').click());
    expect(window.location.search).toBe('');
    expect(container.querySelector('.admin-filter-bar input').value).toBe('');
  } finally {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin');
  }
});
