import axios from 'axios';

const pending = new Map();

// Chỉ gộp GET đang chạy cùng URL/tham số/token. Không cache response sau hoàn tất,
// không chia sẻ dữ liệu giữa hai tài khoản hoặc lưu thêm token vào storage.
function getListForToken(url, params, token) {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([token, url, entries]);
  if (!pending.has(key)) {
    const request = axios.get(url, { params, timeout: 30000, headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.data).finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return pending.get(key);
}

export function getList(url, params = {}) {
  return getListForToken(url, params, localStorage.getItem('token'));
}

// Cầu nối cho màn hình lịch sử cần dữ liệu đầy đủ để giữ đúng nghiệp vụ hiện có.
// Từng request vẫn bị giới hạn; không âm thầm cắt lịch sử ở trang đầu.
export async function getAllPages(url, params = {}) {
  const token = localStorage.getItem('token');
  const checkAccount = () => {
    if (localStorage.getItem('token') !== token) throw new Error('Phiên đăng nhập đã thay đổi');
  };
  const first = await getListForToken(url, { ...params, page: 1, limit: 100 }, token);
  checkAccount();
  if (first.totalPages > 10000) throw new Error('Dữ liệu vượt giới hạn phân trang; cần lọc thêm hoặc dùng cursor');
  const items = [...first.data];
  for (let page = 2; page <= first.totalPages; page += 1) {
    checkAccount();
    const next = await getListForToken(url, { ...params, page, limit: 100 }, token);
    checkAccount();
    if (next.page !== page) throw new Error('Server không trả đúng trang được yêu cầu');
    items.push(...next.data);
  }
  return items;
}
