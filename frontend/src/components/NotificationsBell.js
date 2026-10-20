import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { lockStatusLabels, policyReasonLabels } from '../config/policyLabels';

const READ_KEY = 'read-role-notifications';

const getReadIds = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'));
  } catch (_) {
    return new Set();
  }
};

const NotificationsBell = ({ userRole }) => {
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState(getReadIds);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const loadNotifications = async () => {
      try {
        if (userRole === 'student') {
          const response = await axios.get('/api/student-warnings/mine');
          if (!isMounted) return;
          setItems(response.data
            .filter((warning) => warning.status !== 'dismissed')
            .map((warning) => ({
              id: warning._id,
              title: warning.class?.name || 'Cảnh báo học sinh',
              detail: `${policyReasonLabels[warning.reasonCode] || warning.reasonCode}: ${warning.details}`,
              status: warning.status,
              date: warning.issuedAt,
              href: '/profile',
            })));
        } else if (userRole === 'teacher') {
          const response = await axios.get('/api/classes');
          if (!isMounted) return;
          setItems(response.data
            .filter((classItem) => ['pending', 'appealed', 'locked'].includes(classItem.lockNotice?.status))
            .map((classItem) => ({
              id: `${classItem._id}-${classItem.lockNotice.issuedAt || classItem.lockNotice.status}`,
              title: classItem.name,
              detail: `${policyReasonLabels[classItem.lockNotice.reasonCode] || classItem.lockNotice.reasonCode || 'Thông báo xử lý lớp'}: ${classItem.lockNotice.details || ''}`,
              status: lockStatusLabels[classItem.lockNotice.status] || classItem.lockNotice.status,
              date: classItem.lockNotice.issuedAt,
              href: `/class/${classItem._id}`,
            })));
        }
      } catch (error) {
        if (isMounted) setItems([]);
      }
    };

    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [userRole]);

  const unreadCount = items.filter((item) => !readIds.has(item.id)).length;

  const toggleNotifications = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      const nextReadIds = new Set([...readIds, ...items.map((item) => item.id)]);
      setReadIds(nextReadIds);
      localStorage.setItem(READ_KEY, JSON.stringify([...nextReadIds]));
    }
  };

  return (
    <div className="notification-bell-wrap">
      <button
        aria-expanded={isOpen}
        aria-label={unreadCount ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'}
        className="notification-bell-button"
        onClick={toggleNotifications}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="21" viewBox="0 0 24 24" width="21">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
        <span>Thông báo</span>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {isOpen && (
        <section aria-label="Thông báo mới" className="notification-popover">
          <header><strong>Thông báo</strong><span>{items.length}</span></header>
          {items.length === 0 ? (
            <p className="notification-empty">Bạn chưa có thông báo mới.</p>
          ) : (
            <div className="notification-list">
              {items.map((item) => (
                <button className="notification-item" key={item.id} onClick={() => {
                  setIsOpen(false);
                  navigate(item.href);
                }} type="button">
                  <span className="notification-item-heading"><strong>{item.title}</strong><small>{item.status}</small></span>
                  <span className="notification-item-detail">{item.detail}</span>
                  {item.date && <time>{new Date(item.date).toLocaleString('vi-VN')}</time>}
                </button>
              ))}
            </div>
          )}
          <button className="notification-profile-link" onClick={() => {
            setIsOpen(false);
            navigate('/profile');
          }} type="button">Xem hồ sơ và lịch sử</button>
        </section>
      )}
    </div>
  );
};

export default NotificationsBell;