import React from 'react';

// Suspense chỉ xử lý đang tải; boundary này xử lý lỗi tải chunk để không trắng trang.
export default class RouteBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="main-content" role="alert">
      <p>Không thể tải màn hình. Vui lòng kiểm tra kết nối rồi tải lại trang.</p>
      <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
    </main>;
  }
}
