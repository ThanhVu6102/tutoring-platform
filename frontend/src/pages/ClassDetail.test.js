import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import axios from 'axios';
import ClassDetail from './ClassDetail';

jest.mock('axios');
jest.mock('react-router-dom', () => ({ useParams: () => ({ id: 'class-a' }) }));
jest.mock('../components/TeacherContentTools', () => () => null);
const act = React.act || legacyAct;
let root;
let container;
beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userRole', 'student');
  axios.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/content-summary')
    ? { videos: 42, documents: 3, quizzes: 4, assignments: 2 }
    : url === '/api/classes/class-a'
      ? { _id: 'class-a', name: 'Math', students: [], capacity: 50 }
      : { data: [{ _id: 'video-a', title: 'Video A', videoUrl: 'https://example.com/video' }],
        total: 42, totalPages: 3, page: 1, limit: 20 } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

// Overview chỉ cần thông tin lớp và tổng, không tải trước cả năm danh sách.
test('loads resources on demand, uses real totals and retains a previously opened tab', async () => {
  await act(async () => root.render(<ClassDetail />));
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('42');
  const clickTab = async (name) => {
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === name);
    await act(async () => button.click());
  };
  await clickTab('Video');
  expect(container.textContent).toContain('Video A');
  expect(axios.get).toHaveBeenCalledTimes(3);
  await clickTab('Tổng Quan');
  await clickTab('Video');
  expect(axios.get).toHaveBeenCalledTimes(3);
  expect(container.textContent).toContain('42 kết quả');
});
