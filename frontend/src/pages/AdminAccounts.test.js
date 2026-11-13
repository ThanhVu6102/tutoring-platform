import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import AdminAccounts from './AdminAccounts';

jest.mock('axios');
const act = React.act || legacyAct;
let container;
let root;
const pending = { _id: 'teacher-pending', name: 'Giáo viên chờ', email: 'pending@example.test', role: 'teacher', status: 'pending' };
const rows = [pending,
  { _id: 'student', name: 'Học sinh A', email: 'student@example.test', role: 'student', status: 'active', isBlocked: true },
  { _id: 'admin', name: 'Admin A', email: 'admin@example.test', role: 'admin', status: 'active' },
  { _id: 'teacher', name: 'Giáo viên đang dạy', email: 'teacher@example.test', role: 'teacher', status: 'active' }];
const page = (data = rows, total = data.length, current = 1) => ({ data, total, page: current, limit: 20, totalPages: Math.ceil(total / 20) });
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('token', 'synthetic-admin-token');
  localStorage.setItem('userRole', 'admin');
  localStorage.setItem('userId', 'admin-id');
  axios.get.mockImplementation(async () => ({ data: page() }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove(); localStorage.clear(); jest.useRealTimers();
});
const render = async () => act(async () => root.render(<AdminAccounts />));
const button = (name) => [...container.querySelectorAll('button')].find((item) => item.textContent === name);
const change = (element, value) => act(() => Simulate.change(element, { target: { value } }));
const openReview = async (decision = 'Duyệt giáo viên') => act(async () => button(decision).click());

test('hiển thị vai trò/trạng thái/email và chỉ giáo viên pending có thao tác', async () => {
  await render();
  expect(axios.get.mock.calls[0][1].params).toMatchObject({ role: '', status: '', search: '', page: 1, limit: 20, view: 'moderation' });
  expect(container.textContent).toContain('Quản trị viên');
  expect(container.textContent).toContain('Học sinh');
  expect(container.textContent).toContain('Giáo viên');
  expect(container.textContent).toContain('Chờ duyệt');
  expect(container.textContent).toContain('Đã khóa đăng nhập');
  expect(container.textContent).toContain('pending@example.test');
  expect(container.querySelectorAll('.account-actions button')).toHaveLength(2);
  expect(container.textContent).not.toContain('Reset mật khẩu');
});

test('tìm có debounce, kết hợp filter phía server, trang reset và tổng từ API', async () => {
  axios.get.mockImplementation(async (_, { params }) => ({ data: page(rows, 41, params.page) }));
  await render();
  expect(container.textContent).toContain('41 kết quả');
  await act(async () => button('Sau').click());
  expect(axios.get.mock.calls.at(-1)[1].params.page).toBe(2);
  change(container.querySelector('input[type="search"]'), 'pending@example.test');
  expect(axios.get.mock.calls.at(-1)[1].params.search).toBe('');
  await act(async () => jest.advanceTimersByTime(350));
  expect(axios.get.mock.calls.at(-1)[1].params).toMatchObject({ search: 'pending@example.test', page: 1 });
  await act(async () => Simulate.change(container.querySelectorAll('select')[0], { target: { value: 'teacher' } }));
  await act(async () => Simulate.change(container.querySelectorAll('select')[1], { target: { value: 'pending' } }));
  expect(axios.get.mock.calls.at(-1)[1].params).toMatchObject({ search: 'pending@example.test', role: 'teacher', status: 'pending', page: 1 });
  await act(async () => button('Xóa bộ lọc').click());
  await act(async () => jest.advanceTimersByTime(350));
  expect(axios.get.mock.calls.at(-1)[1].params).toMatchObject({ search: '', role: '', status: '', page: 1 });
});

test('form xác nhận, hủy và approve chỉ gửi một request đúng contract', async () => {
  await render();
  await openReview();
  expect(document.activeElement.id).toBe('account-review-title');
  await act(async () => button('Hủy').click());
  expect(axios.put).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button('Duyệt giáo viên'));
  await openReview();
  let resolve;
  axios.put.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const form = container.querySelector('form');
  await act(async () => { Simulate.submit(form); Simulate.submit(form); });
  expect(axios.put).toHaveBeenCalledTimes(1);
  expect(axios.put).toHaveBeenCalledWith('/api/users/teacher-pending/approve', {});
  expect(button('Đang xử lý...').disabled).toBe(true);
  axios.get.mockResolvedValue({ data: page(rows.slice(1)) });
  await act(async () => resolve({ data: { message: 'done' } }));
  expect(container.textContent).toContain('Đã duyệt hồ sơ giáo viên.');
  expect(container.querySelector('form')).toBeNull();
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test('reject gửi note, giữ bản nháp khi lỗi chung, tải lại chỉ GET', async () => {
  await render(); await openReview('Từ chối giáo viên');
  change(container.querySelector('textarea'), 'Cần bổ sung hồ sơ');
  axios.put.mockRejectedValue({ response: { status: 500, data: { message: 'internal-stack-marker' } } });
  await act(async () => Simulate.submit(container.querySelector('form')));
  expect(axios.put).toHaveBeenCalledWith('/api/users/teacher-pending/reject', { note: 'Cần bổ sung hồ sơ' });
  expect(container.querySelector('textarea').value).toBe('Cần bổ sung hồ sơ');
  expect(container.textContent).not.toContain('internal-stack-marker');
  await act(async () => button('Làm mới').click());
  expect(axios.put).toHaveBeenCalledTimes(1);
});

test('xung đột 409 đóng form, tải lại và không tự ghi lần hai', async () => {
  await render(); await openReview();
  axios.put.mockRejectedValue({ response: { status: 409 } });
  await act(async () => Simulate.submit(container.querySelector('form')));
  expect(container.querySelector('form')).toBeNull();
  expect(container.textContent).toContain('Hồ sơ đã được xử lý');
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(axios.put).toHaveBeenCalledTimes(1);
});

test.each([401, 403, 423])('lỗi quyền %s sau ghi ẩn toàn bộ dữ liệu cũ', async (status) => {
  await render(); await openReview();
  axios.put.mockRejectedValue({ response: { status } });
  await act(async () => Simulate.submit(container.querySelector('form')));
  expect(container.textContent).not.toContain('pending@example.test');
  expect(container.querySelector('form')).toBeNull();
  expect(container.textContent).toContain('Vui lòng đăng nhập lại');
});

test('lỗi đọc có thử lại và không bị diễn giải là chưa có tài khoản', async () => {
  axios.get.mockRejectedValueOnce({ response: { status: 500, data: { message: 'stack-trace-marker' } } });
  await render();
  expect(container.textContent).not.toContain('stack-trace-marker');
  expect(container.textContent).not.toContain('Chưa có tài khoản');
  await act(async () => button('Thử lại').click());
  expect(container.textContent).toContain('pending@example.test');
});

test('lỗi quyền khi đọc không để lộ thẻ danh sách cũ', async () => {
  await render();
  axios.get.mockRejectedValue({ response: { status: 403 } });
  await act(async () => button('Làm mới').click());
  expect(container.querySelector('.account-card')).toBeNull();
});

test('rỗng phân biệt có filter và chưa có dữ liệu', async () => {
  axios.get.mockResolvedValue({ data: page([]) });
  await render();
  expect(container.textContent).toContain('Chưa có tài khoản nào');
  await act(async () => Simulate.change(container.querySelector('select'), { target: { value: 'teacher' } }));
  expect(container.textContent).toContain('Không có tài khoản phù hợp');
});

test('thay phiên ẩn dữ liệu, chặn mutation và bỏ response đang chạy', async () => {
  await render(); await openReview();
  let resolve;
  axios.put.mockImplementation(() => new Promise((done) => { resolve = done; }));
  await act(async () => Simulate.submit(container.querySelector('form')));
  localStorage.setItem('token', 'different-token');
  await act(async () => window.dispatchEvent(new Event('storage')));
  await act(async () => resolve({ data: {} }));
  expect(container.textContent).not.toContain('pending@example.test');
  expect(container.textContent).not.toContain('Đã duyệt hồ sơ');
});

test('response filter cũ không ghi đè filter mới', async () => {
  let resolve;
  axios.get.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await render();
  axios.get.mockResolvedValue({ data: page([rows[1]]) });
  await act(async () => Simulate.change(container.querySelector('select'), { target: { value: 'student' } }));
  await act(async () => resolve({ data: page() }));
  expect(container.textContent).not.toContain('pending@example.test');
  expect(container.textContent).toContain('student@example.test');
});

test.each(['student', 'teacher'])('%s không gọi API admin khi component bị mở trực tiếp', async (role) => {
  localStorage.setItem('userRole', role);
  await render();
  expect(axios.get).not.toHaveBeenCalled();
});
