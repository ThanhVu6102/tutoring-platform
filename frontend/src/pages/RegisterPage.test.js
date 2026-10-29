import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import axios from 'axios';
import RegisterPage from './RegisterPage';
import { POLICY_VERSION } from '../config/policyLabels';

const act = React.act || legacyAct;

const mockNavigate = jest.fn();
jest.mock('axios');
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }) => <span>{children}</span>,
}));
jest.mock('./PoliciesPage', () => () => null);

let container;
let root;
beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.setItem('policy-read-version', POLICY_VERSION);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  sessionStorage.clear();
  localStorage.clear();
});

async function submit(role, response) {
  const onLogin = jest.fn();
  axios.post.mockResolvedValue({ data: response });
  act(() => root.render(<RegisterPage onLogin={onLogin} />));
  for (const [name, value] of Object.entries({ name: 'Test User', email: 'test@example.com',
    password: 'Password123!', confirmPassword: 'Password123!', role })) {
    act(() => Simulate.change(container.querySelector(`[name="${name}"]`), { target: { name, value } }));
  }
  act(() => Simulate.change(container.querySelector('#policy-consent-checkbox'), { target: { checked: true } }));
  await act(async () => Simulate.submit(container.querySelector('form')));
  return onLogin;
}

test('pending teacher keeps policy consent and does not authenticate without a JWT', async () => {
  const onLogin = await submit('teacher', { message: 'Awaiting approval', user: { role: 'teacher', status: 'pending' } });
  expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/auth/register'),
    expect.objectContaining({ role: 'teacher', acceptedPolicies: true }));
  expect(onLogin).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { notice: 'Awaiting approval' } });
  expect(localStorage.getItem('token')).toBeNull();
});

test('student with a JWT retains automatic login and dashboard navigation', async () => {
  const onLogin = await submit('student', { token: 'student-jwt', user: { id: 'student-id', role: 'student' } });
  expect(onLogin).toHaveBeenCalledWith('student-jwt', 'student');
  expect(localStorage.getItem('userId')).toBe('student-id');
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
});
