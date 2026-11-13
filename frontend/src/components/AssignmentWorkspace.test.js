import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import AssignmentWorkspace from './AssignmentWorkspace';

jest.mock('axios');
const act = React.act || legacyAct;
const ids = { studentA: 'a'.repeat(24), studentB: 'b'.repeat(24), teacher: 'c'.repeat(24), class: 'd'.repeat(24), assignment: 'e'.repeat(24) };
let container;
let root;
let detail;
let close;
beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('token', 'synthetic-workspace-token');
  localStorage.setItem('userId', ids.studentA);
  localStorage.setItem('userRole', 'student');
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  detail = { _id: ids.assignment, class: ids.class, title: 'Bài tập chương 1', description: 'Đề bài kiểm thử', totalPoints: 10,
    dueDate: '2026-11-01T10:00:00Z', submissions: [
      { _id: 'row-a', student: ids.studentA, fileUrl: 'https://example.test/A.pdf', score: 7, feedback: 'Nhận xét riêng A',
        submittedAt: '2026-11-01T11:00:00Z', isLate: true, gradedAt: '2026-11-02T10:00:00Z' },
      { _id: 'row-b', student: ids.studentB, fileUrl: 'https://example.test/B.pdf', score: 9, feedback: 'Nhận xét riêng B' },
    ] };
  axios.get.mockImplementation(async () => ({ data: JSON.parse(JSON.stringify(detail)) }));
  close = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  jest.restoreAllMocks();
});

const render = async (props = {}) => act(async () => root.render(<AssignmentWorkspace assignmentId={ids.assignment} classId={ids.class}
  userRole={localStorage.getItem('userRole')} students={[{ _id: ids.studentA, name: 'Học sinh A' }, { _id: ids.studentB, name: 'Học sinh B' }]}
  onClose={close} {...props} />));
const change = (input, value) => act(() => Simulate.change(input, { target: { value } }));
const studentForm = () => container.querySelector('form[aria-label="Nộp bài tập"]');

test('học sinh chỉ thấy bài chính chủ, điểm/feedback/nộp muộn; liên kết mở an toàn', async () => {
  await render();
  expect(axios.get).toHaveBeenCalledWith(`/api/assignments/${ids.assignment}`);
  expect(container.textContent).toContain('Nhận xét riêng A');
  expect(container.textContent).toContain('7 / 10');
  expect(container.textContent).toContain('Nộp muộn');
  expect(container.textContent).not.toContain('Nhận xét riêng B');
  expect(container.querySelector('a[href="https://example.test/B.pdf"]')).toBeNull();
  expect(container.querySelector('a').rel).toBe('noopener noreferrer');
  expect(container.querySelector('form[aria-label^="Chấm bài"]')).toBeNull();
  expect(document.activeElement).toBe(container.querySelector('h3'));
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Đóng chi tiết').click());
  expect(close).toHaveBeenCalledTimes(1);
});

test('chưa nộp: gửi đúng fileUrl, chặn hai submit cùng lượt và tải lại chi tiết sau thành công', async () => {
  detail.submissions = [];
  await render();
  expect(container.textContent).toContain('Bạn chưa nộp bài tập này.');
  let resolve;
  axios.post.mockImplementation(() => new Promise((done) => { resolve = done; }));
  change(container.querySelector('input[name="fileUrl"]'), 'https://example.test/new.pdf');
  await act(async () => { Simulate.submit(studentForm()); Simulate.submit(studentForm()); });
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledWith(`/api/assignments/${ids.assignment}/submit`, { fileUrl: 'https://example.test/new.pdf' });
  expect(container.querySelector('input').disabled).toBe(true);
  detail.submissions = [{ student: ids.studentA, fileUrl: 'https://example.test/new.pdf', score: 0 }];
  await act(async () => resolve({ data: { message: 'Đã nộp bài tập' } }));
  expect(container.textContent).toContain('Đã nộp bài tập');
  expect(container.textContent).toContain('0 / 10');
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test('nộp lại cần xác nhận, giữ đúng payload và không gửi nếu người dùng hủy', async () => {
  await render();
  change(container.querySelector('input[name="fileUrl"]'), 'https://example.test/replacement.pdf');
  window.confirm.mockReturnValueOnce(false);
  await act(async () => Simulate.submit(studentForm()));
  expect(axios.post).not.toHaveBeenCalled();
  axios.post.mockResolvedValue({ data: { message: 'Đã cập nhật' } });
  await act(async () => Simulate.submit(studentForm()));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Điểm và nhận xét đã có vẫn được giữ nguyên'));
  expect(axios.post).toHaveBeenCalledWith(`/api/assignments/${ids.assignment}/submit`, { fileUrl: 'https://example.test/replacement.pdf' });
});

test('URL sai không gọi API; URL legacy không an toàn không thành liên kết', async () => {
  detail.submissions[0].fileUrl = 'javascript:alert(1)';
  await render();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(container.textContent).toContain('Đường dẫn bài nộp không hợp lệ');
  for (const value of ['javascript:alert(1)', '/relative.pdf', '']) {
    change(container.querySelector('input[name="fileUrl"]'), value);
    await act(async () => Simulate.submit(studentForm()));
    expect(container.textContent).toContain('Vui lòng nhập đường dẫn HTTP hoặc HTTPS hợp lệ.');
  }
  expect(axios.post).not.toHaveBeenCalled();
});

test('lỗi ghi giữ nội dung nhập, không hiển thị chi tiết kỹ thuật nội bộ', async () => {
  await render();
  change(container.querySelector('input[name="fileUrl"]'), 'https://example.test/retry.pdf');
  axios.post.mockRejectedValue({ response: { status: 500, data: { message: 'internal-stack-secret-value' } } });
  await act(async () => Simulate.submit(studentForm()));
  expect(container.querySelector('input[name="fileUrl"]').value).toBe('https://example.test/retry.pdf');
  expect(container.textContent).toContain('Nội dung bạn nhập được giữ lại');
  expect(container.textContent).not.toContain('internal-stack-secret-value');
});

test('POST thành công nhưng GET lỗi: thử lại chỉ đọc, không tự gửi bài nộp lần nữa', async () => {
  await render();
  axios.post.mockResolvedValue({ data: { message: 'Đã lưu bài nộp' } });
  axios.get.mockRejectedValueOnce(new Error('network'));
  await act(async () => Simulate.submit(studentForm()));
  expect(container.textContent).toContain('Đã lưu bài nộp');
  expect(container.textContent).toContain('có thể chưa cập nhật');
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Thử tải lại').click());
  expect(axios.get).toHaveBeenCalledTimes(3);
  expect(axios.post).toHaveBeenCalledTimes(1);
});

test.each(['teacher', 'admin'])('%s xem/chấm đủ hai bài nộp, điểm 0 hợp lệ và chỉ gửi trường cần thiết', async (role) => {
  localStorage.setItem('userRole', role);
  localStorage.setItem('userId', ids.teacher);
  await render();
  expect(container.textContent).toContain('Nhận xét riêng A');
  expect(container.textContent).toContain('Nhận xét riêng B');
  expect(studentForm()).toBeNull();
  const form = container.querySelector('form[aria-label="Chấm bài của Học sinh A"]');
  expect(form.querySelector('textarea').labels[0].textContent).toBe('Nhận xét');
  change(form.querySelector('input'), '0');
  change(form.querySelector('textarea'), 'Cần bổ sung');
  axios.post.mockImplementation(async () => {
    detail.submissions[0].score = 0;
    detail.submissions[0].feedback = 'Cần bổ sung';
    return { data: { message: 'Đã chấm điểm' } };
  });
  await act(async () => Simulate.submit(form));
  expect(axios.post).toHaveBeenCalledWith(`/api/assignments/${ids.assignment}/grade`, { studentId: ids.studentA, score: 0, feedback: 'Cần bổ sung' });
  expect(container.textContent).toContain('0 / 10');
  expect(container.textContent).toContain('Cần bổ sung');
});

test('giáo viên không gửi điểm rỗng, âm hoặc vượt thang điểm; chặn submit lặp', async () => {
  localStorage.setItem('userRole', 'teacher');
  await render();
  const form = container.querySelector('form[aria-label="Chấm bài của Học sinh A"]');
  for (const score of ['', '-1', '11']) {
    change(form.querySelector('input'), score);
    await act(async () => Simulate.submit(form));
    expect(container.textContent).toContain('Điểm phải là số từ 0 đến tổng điểm của bài tập.');
  }
  expect(axios.post).not.toHaveBeenCalled();
  change(form.querySelector('input'), '5');
  let resolve;
  axios.post.mockImplementation(() => new Promise((done) => { resolve = done; }));
  await act(async () => { Simulate.submit(form); Simulate.submit(form); });
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(window.confirm).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ data: {} }));
});

test('lưu một điểm không làm mất bản nháp nhận xét của học sinh khác', async () => {
  localStorage.setItem('userRole', 'teacher');
  await render();
  const second = container.querySelector('form[aria-label="Chấm bài của Học sinh B"]');
  change(second.querySelector('textarea'), 'Bản nháp chưa lưu');
  axios.post.mockImplementation(async () => {
    detail.submissions[0].score = 6;
    return { data: {} };
  });
  const first = container.querySelector('form[aria-label="Chấm bài của Học sinh A"]');
  change(first.querySelector('input'), '6');
  await act(async () => Simulate.submit(first));
  expect(container.querySelector('form[aria-label="Chấm bài của Học sinh B"] textarea').value).toBe('Bản nháp chưa lưu');
});

test.each([401, 403, 404, 423])('lỗi %s sau thao tác xóa chi tiết cũ và chặn ghi tiếp', async (status) => {
  await render();
  axios.post.mockRejectedValue({ response: { status } });
  await act(async () => Simulate.submit(studentForm()));
  expect(studentForm()).toBeNull();
  expect(container.textContent).not.toContain('Nhận xét riêng A');
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

test('GET lỗi có thử lại, không ghi; dữ liệu khác lớp bị từ chối hiển thị', async () => {
  axios.get.mockRejectedValueOnce({ response: { status: 403 } });
  await render();
  expect(studentForm()).toBeNull();
  detail.class = 'other-class';
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Thử tải lại').click());
  expect(container.textContent).toContain('Dữ liệu bài tập không khớp lớp đang mở.');
  expect(container.textContent).not.toContain('Nhận xét riêng A');
  expect(axios.post).not.toHaveBeenCalled();
});

test('bỏ response cũ khi chuyển bài tập; không hiển thị sau khi phiên tài khoản thay đổi', async () => {
  let oldResponse;
  axios.get.mockImplementationOnce(() => new Promise((done) => { oldResponse = done; }));
  await render();
  const nextId = 'f'.repeat(24);
  const old = JSON.parse(JSON.stringify(detail));
  detail._id = nextId;
  detail.title = 'Bài tập mới';
  await render({ assignmentId: nextId });
  await act(async () => oldResponse({ data: old }));
  expect(container.textContent).toContain('Bài tập mới');
  expect(container.textContent).not.toContain('Bài tập chương 1');
  localStorage.setItem('userId', ids.studentB);
  await act(async () => window.dispatchEvent(new Event('storage')));
  expect(container.textContent).toContain('Phiên đăng nhập đã thay đổi');
  expect(container.textContent).not.toContain('Nhận xét riêng A');
});

test('thiếu phiên không gọi API chi tiết', async () => {
  localStorage.removeItem('token');
  await render();
  expect(container.textContent).toContain('Phiên đăng nhập đã thay đổi');
  expect(axios.get).not.toHaveBeenCalled();
});
