import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './styles/App.css';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import ClassDetail from './pages/ClassDetail';
import QuizTaking from './pages/QuizTaking';

// Components
import Navbar from './components/Navbar';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole'));

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    setIsAuthenticated(!!token);
    setUserRole(role);
  }, []);

  const handleLogin = (token, role) => {
    localStorage.setItem('token', token);
    localStorage.setItem('userRole', role);
    setIsAuthenticated(true);
    setUserRole(role);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    setIsAuthenticated(false);
    setUserRole(null);
  };

  const watermarks = [
    { src: '/icon1.png', className: 'wm wm-1' },
    { src: '/icon2.png', className: 'wm wm-2' },
    { src: '/icon3.jpg', className: 'wm wm-3' },
    { src: '/icon1.png', className: 'wm wm-4' },
    { src: '/icon2.png', className: 'wm wm-5' },
    { src: '/icon3.jpg', className: 'wm wm-6' },
    { src: '/icon1.png', className: 'wm wm-7' },
    { src: '/icon2.png', className: 'wm wm-8' },
    { src: '/icon3.jpg', className: 'wm wm-9' },
  ];

  return (
    <Router>
      <div className="page-shell">
        <div className="page-watermarks" aria-hidden="true">
          {watermarks.map((item, index) => (
            <img key={`${item.src}-${index}`} src={item.src} className={item.className} alt="" />
          ))}
        </div>

        {isAuthenticated && <Navbar userRole={userRole} onLogout={handleLogout} />}
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="/register" element={<RegisterPage onLogin={handleLogin} />} />
          
          {isAuthenticated ? (
            <>
              <Route path="/dashboard" element={<Dashboard userRole={userRole} />} />
              <Route path="/class/:id" element={<ClassDetail />} />
              <Route path="/quiz/:quizId/take" element={<QuizTaking />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </>
          ) : (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </div>
    </Router>
  );
};

export default App;
