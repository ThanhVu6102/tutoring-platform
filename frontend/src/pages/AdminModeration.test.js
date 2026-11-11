import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import AdminModeration from './AdminModeration';
jest.mock('axios');
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
const act = React.act || legacyAct;
let root;
let container;
const page = (data = [], current = 1, total = 55) => ({ data, page: current, limit: 20, total, totalPages: Math.ceil(total / 20) });
const summary = { totalWarnings: 2500, openWarnings: 73, violationClasses: 42 };
let warningData;

beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('userRole', 'admin');
  localStorage.setItem('token', 'moderation-test-token');
  warningData = [{ _id: 'w', student: { name: 'Student', email: 'test@example.test' },
    class: { name: 'Class' }, status: 'appealed', issuedAt: '2026-01-01', appealDeadline: '2027-01-01' }];
  axios.get.mockImplementation(async (url, config) => ({ data: url.endsWith('/summary') ? summary
    : page(url.endsWith('/warnings') ? warningData : [], config.params.page) }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });
const render = async () => act(async () => root.render(<AdminModeration />));
const click = async (label) => act(async () => {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  Simulate.click(button);
});

test('initial moderation loads only summary and one warning page; totals are not the page length', async () => {
  await render();
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(axios.get.mock.calls.map(([url]) => url).sort()).toEqual(['/api/moderation/summary', '/api/moderation/warnings']);
  expect([...container.querySelectorAll('.admin-summary strong')].map((item) => item.textContent)).toEqual(['2500', '73', '42']);
  expect(container.textContent).toContain('55 kết quả');
});

test('tabs load lazily, preserve their page and do not fetch every page or legacy APIs', async () => {
  await render();
  await click('Sau');
  expect(axios.get.mock.calls.at(-1)[1].params.page).toBe(2);
  await click('Học sinh bị xử lý');
  expect(axios.get.mock.calls.at(-1)[0]).toBe('/api/moderation/students');
  await click('Lớp vi phạm');
  expect(axios.get.mock.calls.at(-1)[0]).toBe('/api/moderation/classes');
  const count = axios.get.mock.calls.length;
  await click('Cảnh báo & kháng cáo');
  expect(axios.get).toHaveBeenCalledTimes(count);
  expect(container.textContent).toContain('Trang 2/3');
  expect(axios.get.mock.calls.every(([url]) => url.startsWith('/api/moderation/'))).toBe(true);
});

test('review refreshes summary and current page without loading unopened tabs; blocks duplicate submission', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  let finish;
  axios.patch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await render();
  const review = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Chấp thuận, gỡ cảnh báo');
  act(() => { Simulate.click(review); Simulate.click(review); });
  expect(axios.patch).toHaveBeenCalledTimes(1);
  expect(review.disabled).toBe(true);
  warningData = [];
  await act(async () => finish({ data: {} }));
  expect(axios.get).toHaveBeenCalledTimes(4);
  expect(axios.get.mock.calls.every(([url]) => ['/api/moderation/summary', '/api/moderation/warnings'].includes(url))).toBe(true);
  confirm.mockRestore();
});

test('list and summary failures are visible and can be retried', async () => {
  axios.get.mockRejectedValue({ response: { data: { message: 'Không tải được dữ liệu test' } } });
  await render();
  expect(container.textContent).toContain('Không tải được dữ liệu test');
  axios.get.mockResolvedValue({ data: page([], 1, 0) });
  await click('Thử lại');
  expect(container.textContent).toContain('Chưa có hồ sơ cảnh báo.');
  axios.get.mockResolvedValue({ data: summary });
  await click('Làm mới tổng hồ sơ');
  expect([...container.querySelectorAll('.admin-summary strong')].map((item) => item.textContent)).toEqual(['2500', '73', '42']);
});
