import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from './Navbar';

jest.mock('axios');
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn(), useLocation: jest.fn() }));
jest.mock('./NotificationsBell', () => () => <span>Chuông</span>);
const act = React.act || legacyAct;

test('mobile menu exposes its state and closes after navigation; profile falls back to initial', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  useLocation.mockReturnValue({ pathname: '/dashboard' });
  const navigate = jest.fn();
  useNavigate.mockReturnValue(navigate);
  axios.get.mockResolvedValue({ data: { name: 'An', avatar: '' } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Navbar userRole="student" isAuthenticated onLogout={jest.fn()} />));
    expect(container.querySelector('.navbar-avatar').textContent).toBe('A');
    const toggle = container.querySelector('.navbar-menu-toggle');
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await act(async () => [...container.querySelectorAll('#navbar-actions button')].find((button) => button.textContent === 'Trang chủ').click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
    await act(async () => container.querySelector('.navbar-avatar').click());
    expect(navigate).toHaveBeenCalledWith('/profile');
  } finally { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); }
});

test('avatar falls back after image error and refreshes when the profile changes', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  useLocation.mockReturnValue({ pathname: '/dashboard' });
  useNavigate.mockReturnValue(jest.fn());
  let profile = { name: 'An', avatar: '/broken-avatar.png' };
  axios.get.mockImplementation(async () => ({ data: profile }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Navbar userRole="student" isAuthenticated onLogout={jest.fn()} />));
    expect(container.querySelector('.navbar-avatar img').getAttribute('src')).toBe('/broken-avatar.png');
    await act(async () => Simulate.error(container.querySelector('.navbar-avatar img')));
    expect(container.querySelector('.navbar-avatar').textContent).toBe('A');
    profile = { name: 'Bình', avatar: '/new-avatar.png' };
    await act(async () => window.dispatchEvent(new Event('eklasses:profile-updated')));
    expect(container.querySelector('.navbar-avatar img').getAttribute('src')).toBe('/new-avatar.png');
    profile = { name: '', avatar: '' };
    await act(async () => window.dispatchEvent(new Event('eklasses:profile-updated')));
    expect(container.querySelector('.navbar-avatar').textContent).toBe('?');
  } finally { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); }
});
