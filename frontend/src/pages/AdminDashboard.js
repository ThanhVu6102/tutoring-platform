import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePagedList from '../hooks/usePagedList';
import useDebouncedValue from '../hooks/useDebouncedValue';
import Pagination from '../components/Pagination';

const AdminDashboard = () => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const list = usePagedList('/api/classes', { summary: 'true', search: debouncedSearch });
  const { data: classes, loading, error } = list;
  const navigate = useNavigate();


  const teacherGroups = classes.reduce((groups, classItem) => {
    const teacherId = classItem.teacher?._id || 'unassigned';
    if (!groups[teacherId]) {
      groups[teacherId] = {
        teacher: classItem.teacher,
        classes: [],
      };
    }
    groups[teacherId].classes.push(classItem);
    return groups;
  }, {});

  // Các tổng lấy từ database trên toàn bộ filter, không phải chỉ trang đang mở.
  const activeCount = list.summary?.active ?? '—';
  const lockedCount = list.summary?.inactive ?? '—';
  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">KHÔNG GIAN QUẢN TRỊ</p>
          <h1>Quản lý lớp học</h1>
          <p className="admin-intro">Theo dõi lớp học, giáo viên phụ trách và trạng thái hoạt động.</p>
        </div>
        <div className="admin-summary" aria-label="Tổng quan lớp học">
          <div><span>Tổng số lớp theo bộ lọc</span><strong>{list.summary?.total ?? '—'}</strong></div>
          <div><span>Đang hoạt động</span><strong>{activeCount}</strong></div>
          <div><span>Đã khóa</span><strong>{lockedCount}</strong></div>
        </div>
      </header>

      {error && <div className="admin-alert" role="alert">{error}</div>}
      <label>Tìm lớp theo tên <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <Pagination list={list} label="lớp quản trị" />
      <section className="admin-archive-shortcut">
        <div><h2>Hồ sơ vi phạm</h2><p>Cảnh báo học sinh, kháng cáo, chế tài tài khoản và các lớp có vi phạm được lưu trữ riêng.</p></div>
        <button className="btn btn-primary" onClick={() => navigate('/admin/moderation')} type="button">Mở hồ sơ vi phạm</button>
      </section>
      {loading && classes.length === 0 ? (
        <p className="admin-state">Đang tải danh sách lớp...</p>
      ) : classes.length === 0 ? (
        <p className="admin-state">Chưa có lớp học nào trong hệ thống.</p>
      ) : (
        <div className="teacher-groups">
          {Object.entries(teacherGroups).map(([teacherId, group]) => (
            <section className="teacher-group" key={teacherId}>
              <header className="teacher-group-heading">
                <div>
                  <h2>{group.teacher?.name || 'Chưa có giáo viên'}</h2>
                  <p>{group.teacher?.email || 'Chưa gán giáo viên'}</p>
                </div>
                <span>{group.classes.length} lớp trên trang này</span>
              </header>
              <div className="admin-class-grid">
                {group.classes.map((classItem) => (
                  <button
                    className="admin-class-tile"
                    key={classItem._id}
                    onClick={() => navigate(`/admin/classes/${classItem._id}`)}
                    type="button"
                  >
                      <span className={`status-indicator ${classItem.status === 'inactive' || ['pending', 'appealed'].includes(classItem.lockNotice?.status) ? 'is-locked' : ''}`}>
                        {classItem.status === 'inactive'
                          ? 'Đã khóa'
                          : classItem.lockNotice?.status === 'appealed'
                            ? 'Có kháng cáo'
                            : classItem.lockNotice?.status === 'pending'
                              ? 'Chờ 24 giờ'
                              : 'Đang mở'}
                    </span>
                    <strong>{classItem.name}</strong>
                    <span className="admin-class-meta">
                      {[classItem.subject, classItem.grade].filter(Boolean).join(' · ') || 'Chưa cập nhật môn học'}
                    </span>
                    <span className="admin-class-footer">
                      <span>{classItem.studentCount || 0} học sinh</span>
                      <span aria-hidden="true">Xem chi tiết <b>→</b></span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
};

export default AdminDashboard;
