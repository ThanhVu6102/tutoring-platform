import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Dashboard = ({ userRole }) => {
  const [classes, setClasses] = useState([]);
  const [activeTab, setActiveTab] = useState('classes');
  const [newClass, setNewClass] = useState({
    name: '',
    description: '',
    subject: '',
    grade: '',
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/classes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClasses(response.data);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/classes', newClass, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewClass({ name: '', description: '', subject: '', grade: '' });
      fetchClasses();
      setActiveTab('classes');
    } catch (error) {
      console.error('Error creating class:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main-content">
      <div className="section-header">
        <h2> {userRole === 'teacher' ? 'Lớp Học Của Tôi' : 'Lớp Học Đã Tham Gia'}</h2>
      </div>

      {userRole === 'teacher' && (
        <div style={{ marginBottom: '2rem' }}>
          <button 
            className="btn btn-primary"
            onClick={() => setActiveTab(activeTab === 'create' ? 'classes' : 'create')}
          >
            {activeTab === 'create' ? '✕ Đóng' : '+ Tạo Lớp Học Mới'}
          </button>
        </div>
      )}

      {activeTab === 'create' && userRole === 'teacher' && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3>Tạo Lớp Học Mới</h3>
          <form onSubmit={handleCreateClass}>
            <div className="form-group">
              <label>Tên lớp học</label>
              <input
                type="text"
                value={newClass.name}
                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                placeholder="VD: Toán lớp 10"
                required
              />
            </div>

            <div className="form-group">
              <label>Mô tả</label>
              <textarea
                value={newClass.description}
                onChange={(e) => setNewClass({ ...newClass, description: e.target.value })}
                placeholder="Mô tả về lớp học"
                rows="3"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Môn học</label>
                <input
                  type="text"
                  value={newClass.subject}
                  onChange={(e) => setNewClass({ ...newClass, subject: e.target.value })}
                  placeholder="VD: Toán"
                  required
                />
              </div>

              <div className="form-group">
                <label>Khối lớp</label>
                <input
                  type="text"
                  value={newClass.grade}
                  onChange={(e) => setNewClass({ ...newClass, grade: e.target.value })}
                  placeholder="VD: Lớp 10"
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-success"
              disabled={loading}
            >
              {loading ? 'Đang tạo...' : 'Tạo Lớp Học'}
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-2">
        {classes.length > 0 ? (
          classes.map(cls => (
            <div key={cls._id} className="card card-yellow">
              <h3 style={{ color: '#E63946', marginBottom: '0.5rem' }}>{cls.name}</h3>
              <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                {cls.description}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ 
                  background: '#E63946', 
                  color: 'white', 
                  padding: '0.25rem 0.75rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem'
                }}>
                  {cls.subject}
                </span>
                {cls.grade && (
                  <span style={{ 
                    background: '#F4D35E', 
                    color: '#333', 
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem'
                  }}>
                    {cls.grade}
                  </span>
                )}
              </div>
              <div style={{ 
                fontSize: '0.9rem', 
                color: '#666',
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid #eee'
              }}>
                <strong>Học sinh:</strong> {cls.students?.length || 0}
              </div>
              <button 
                className="btn btn-primary btn-block"
                onClick={() => navigate(`/class/${cls._id}`)}
              >
                Vào Lớp →
              </button>
            </div>
          ))
        ) : (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center' }}>
            <p style={{ color: '#999' }}>
              {userRole === 'teacher' ? 'Bạn chưa có lớp học nào. Hãy tạo lớp mới!' : 'Bạn chưa tham gia lớp học nào'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
