import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const AdminDashboard = () => {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const loadClasses = async () => {
      try {
        const response = await axios.get('/api/classes');
        setClasses(response.data);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Không tải được danh sách lớp học.');
      } finally {
        setLoading(false);
      }
    };

    loadClasses();
  }, []);

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

  const activeCount = classes.filter((classItem) => classItem.status !== 'inactive').length;
  const lockedCount = classes.length - activeCount;

  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">KHÔNG GIAN QUẢN TRỊ</p>
          <h1>Quản lý lớp học</h1>
          <p className="admin-intro">Theo dõi lớp học, giáo viên phụ trách và trạng thái hoạt động.</p>
        </div>
        <div className="admin-summary" aria-label="Tổng quan lớp học">
          <div><span>Tổng số lớp</span><strong>{classes.length}</strong></div>
          <div><span>Đang hoạt động</span><strong>{activeCount}</strong></div>
          <div><span>Đã khóa</span><strong>{lockedCount}</strong></div>
        </div>
      </header>

      {error && <div className="admin-alert" role="alert">{error}</div>}
      {loading ? (
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
                <span>{group.classes.length} lớp</span>
              </header>
              <div className="admin-class-grid">
                {group.classes.map((classItem) => (
                  <button
                    className="admin-class-tile"
                    key={classItem._id}
                    onClick={() => navigate(`/admin/classes/${classItem._id}`)}
                    type="button"
                  >
                    <span className={`status-indicator ${classItem.status === 'inactive' ? 'is-locked' : ''}`}>
                      {classItem.status === 'inactive' ? 'Đã khóa' : 'Đang mở'}
                    </span>
                    <strong>{classItem.name}</strong>
                    <span className="admin-class-meta">
                      {[classItem.subject, classItem.grade].filter(Boolean).join(' · ') || 'Chưa cập nhật môn học'}
                    </span>
                    <span className="admin-class-footer">
                      <span>{classItem.students?.length || 0} học sinh</span>
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