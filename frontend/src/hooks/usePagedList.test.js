import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import axios from 'axios';
import usePagedList from './usePagedList';
import { getAllPages, getList } from '../utils/listRequests';

jest.mock('axios');
const act = React.act || legacyAct;
let root;
let container;
let latest;
function Probe({ url = '/api/classes', enabled = true }) {
  latest = usePagedList(url, {}, enabled);
  return <div>{latest.data.map((item) => item.name).join(',')}{latest.error}</div>;
}
const page = (name, current = 1) => ({ data: [{ name }], page: current, limit: 20, total: 40, totalPages: 2 });

beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('token', 'test-token');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

test('disabled tab does not request data and reopening a loaded tab does not refetch', async () => {
  axios.get.mockResolvedValue({ data: page('Video') });
  await act(async () => root.render(<Probe enabled={false} />));
  expect(axios.get).not.toHaveBeenCalled();
  await act(async () => root.render(<Probe enabled />));
  expect(axios.get).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Probe enabled={false} />));
  await act(async () => root.render(<Probe enabled />));
  expect(axios.get).toHaveBeenCalledTimes(1);
  await act(async () => latest.reload());
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test('stale request cannot replace data from the new URL', async () => {
  let resolveOld;
  axios.get.mockImplementation((url) => url === '/old'
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.resolve({ data: page('New') }));
  await act(async () => root.render(<Probe url="/old" />));
  await act(async () => root.render(<Probe url="/new" />));
  expect(container.textContent).toBe('New');
  await act(async () => resolveOld({ data: page('Old') }));
  expect(container.textContent).toBe('New');
});

test('pagination keeps existing items while the next page is loading', async () => {
  let resolveNext;
  axios.get.mockImplementation((url, options) => options.params.page === 1
    ? Promise.resolve({ data: page('First') })
    : new Promise((resolve) => { resolveNext = resolve; }));
  await act(async () => root.render(<Probe />));
  await act(async () => latest.setPage(2));
  expect(latest.loading).toBe(true);
  expect(container.textContent).toBe('First');
  await act(async () => resolveNext({ data: page('Second', 2) }));
  expect(container.textContent).toBe('Second');
  expect(latest.total).toBe(40);
});

test('concurrent identical GET requests are shared but different tokens are isolated', async () => {
  const completions = [];
  axios.get.mockImplementation(() => new Promise((resolve) => completions.push(resolve)));
  const first = getList('/shared');
  const second = getList('/shared');
  expect(first).toBe(second);
  localStorage.setItem('token', 'other-token');
  const third = getList('/shared');
  expect(third).not.toBe(first);
  expect(axios.get).toHaveBeenCalledTimes(2);
  completions.forEach((resolve) => resolve({ data: page('Shared') }));
  await Promise.all([first, second, third]);
});

test('history adapter fetches every page rather than silently truncating at page one', async () => {
  axios.get.mockImplementation((url, options) => Promise.resolve({ data: page(`Item ${options.params.page}`, options.params.page) }));
  const data = await getAllPages('/history');
  expect(data.map((item) => item.name)).toEqual(['Item 1', 'Item 2']);
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test('history adapter stops instead of mixing accounts after a token change', async () => {
  axios.get.mockImplementation(() => {
    localStorage.setItem('token', 'new-session');
    return Promise.resolve({ data: page('Old session') });
  });
  await expect(getAllPages('/history-account-change')).rejects.toThrow('Phiên đăng nhập đã thay đổi');
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('failed requests expose an error, and retry can recover without showing false empty success', async () => {
  axios.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: page('Recovered') });
  await act(async () => root.render(<Probe url="/retry" />));
  expect(latest.loading).toBe(false);
  expect(latest.error).toContain('Không thể tải danh sách');
  await act(async () => latest.reload());
  expect(latest.error).toBe('');
  expect(container.textContent).toBe('Recovered');
});
