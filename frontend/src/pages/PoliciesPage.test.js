import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import { useLocation, useNavigate } from 'react-router-dom';
import PoliciesPage from './PoliciesPage';

jest.mock('react-router-dom', () => ({ useLocation: jest.fn(), useNavigate: jest.fn() }));
const act = React.act || legacyAct;

test.each([
  [{ returnToRegister: true }, null, '/register'],
  [null, { token: 'test', role: 'student' }, '/dashboard'],
  [null, { token: 'test', role: 'admin' }, '/admin'],
  [null, null, '/login'],
])('policy confirmation keeps the intended navigation', async (locationState, auth, destination) => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear(); localStorage.clear();
  if (auth) { localStorage.setItem('token', auth.token); localStorage.setItem('userRole', auth.role); }
  const navigate = jest.fn();
  useLocation.mockReturnValue({ state: locationState });
  useNavigate.mockReturnValue(navigate);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PoliciesPage />));
    await act(async () => container.querySelector('.policy-footer button').click());
    expect(navigate).toHaveBeenCalledWith(destination);
    expect(sessionStorage.getItem('policy-read-version')).toBeTruthy();
  } finally { act(() => root.unmount()); container.remove(); }
});

test('embedded policy uses onRead without redirecting', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  useLocation.mockReturnValue({ state: null });
  const navigate = jest.fn();
  useNavigate.mockReturnValue(navigate);
  const onRead = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PoliciesPage embedded onRead={onRead} />));
    await act(async () => container.querySelector('.policy-footer button').click());
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); container.remove(); sessionStorage.clear(); localStorage.clear(); }
});
