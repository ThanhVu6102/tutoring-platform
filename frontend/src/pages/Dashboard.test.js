import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import Dashboard from './Dashboard';

jest.mock('axios');
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
const act = React.act || legacyAct;

test('create class keeps form data and shows API failure, then reports success', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('token', 'teacher-test-token');
  axios.get.mockResolvedValue({ data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0 } });
  axios.post.mockRejectedValueOnce({ response: { data: { message: 'Máy chủ tạm bận' } } })
    .mockResolvedValueOnce({ data: { _id: 'new-class' } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Dashboard userRole="teacher" />));
    act(() => Simulate.click([...container.querySelectorAll('button')].find((node) => node.textContent.includes('Tạo Lớp Học Mới'))));
    const [name, subject] = container.querySelectorAll('form input');
    act(() => Simulate.change(name, { target: { value: 'Lớp giữ dữ liệu' } }));
    act(() => Simulate.change(subject, { target: { value: 'Toán' } }));
    await act(async () => Simulate.submit(container.querySelector('form')));
    expect(container.querySelector('[role="alert"]').textContent).toContain('Máy chủ tạm bận');
    expect(container.querySelector('form input').value).toBe('Lớp giữ dữ liệu');
    await act(async () => Simulate.submit(container.querySelector('form')));
    expect(container.querySelector('[role="status"]').textContent).toContain('Đã tạo lớp học');
    expect(container.querySelector('form')).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    jest.clearAllMocks();
  }
});
