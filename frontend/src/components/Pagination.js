import React from 'react';

// Điều hướng trang dùng chung, không lấy length trang hiện tại thay cho tổng dữ liệu.
export default function Pagination({ list, label = 'Danh sách' }) {
  return <nav aria-label={`Phân trang ${label}`} className="pagination-controls">
    <span>{list.total} kết quả · Trang {list.page}/{Math.max(1, list.totalPages)}</span>
    <button className="btn btn-secondary" type="button" disabled={list.loading || list.page <= 1}
      onClick={() => list.setPage(list.page - 1)}>Trước</button>
    <button className="btn btn-secondary" type="button" disabled={list.loading || list.page >= list.totalPages}
      onClick={() => list.setPage(list.page + 1)}>Sau</button>
    <button className="btn btn-secondary" type="button" disabled={list.loading}
      onClick={list.reload}>{list.error ? 'Thử lại' : 'Làm mới'}</button>
    {list.loading && <span role="status">Đang tải...</span>}
    {list.error && <span role="alert">{list.error}</span>}
  </nav>;
}
