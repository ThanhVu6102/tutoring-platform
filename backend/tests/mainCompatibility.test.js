const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const { authMiddleware } = require('../middleware/auth');
const { activeAccountFilter } = require('../utils/accountAccess');
const { accessibleClass } = require('../utils/classSessions');
const studentId = 'a'.repeat(24);
const teacherId = 'b'.repeat(24);
const classId = 'c'.repeat(24);
const token = jwt.sign({ userId: studentId, role: 'admin' }, process.env.JWT_SECRET || 'your-secret-key');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const query = (value) => ({
  select() { return this; }, populate() { return this; }, sort() { return this; },
  lean: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

async function appURL(t, route, router) {
  const app = express();
  app.use(express.json({ limit: '7mb' }));
  app.use(route, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('main schema fields coexist with lifecycle fields and base64 profile avatars', () => {
  const user = new User({ name: 'Student', email: 'student@example.com', role: 'student', password: 'password',
    avatar: `data:image/png;base64,${'a'.repeat(3000)}`, policiesAcceptedAt: new Date(), policyVersion: '0.1.1',
    disciplinarySanctions: 2, classRemovalIncidents: 3, permanentlyBanned: true });
  assert.equal(user.validateSync(), undefined);
  assert.equal(user.permanentlyBanned, true);
  assert.equal(user.status, 'active');
  assert.equal(user.policyVersion, '0.1.1');
  const cls = new Class({ name: 'Math', subject: 'Math', teacher: teacherId, joinCode: 'ABCD1234',
    joinRequests: [{ student: studentId }], lockNotice: { status: 'pending', details: 'Notice' } });
  assert.equal(cls.validateSync(), undefined);
  assert.equal(cls.joinCode, 'ABCD1234');
  assert.equal(cls.joinRequests.length, 1);
  assert.equal(cls.lockNotice.status, 'pending');
});

test('middleware keeps legacy accounts active but retains bans and suspensions', async (t) => {
  let user = { role: 'student' }; // Document cũ trên main chưa có status.
  t.mock.method(User, 'findById', () => query(user));
  let passed = false;
  const req = { header: () => headers.Authorization };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await authMiddleware(req, res, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(req.userRole, 'student');
  for (const [account, code] of [
    [{ role: 'student', permanentlyBanned: true }, 403],
    [{ role: 'student', suspendedUntil: new Date(Date.now() + 3600000) }, 423],
  ]) {
    user = account;
    await authMiddleware(req, res, () => assert.fail('Sanctioned account must be denied'));
    assert.equal(res.code, code);
  }
});

test('active account query includes legacy documents and excludes main sanctions', () => {
  const now = new Date();
  const filter = activeAccountFilter(now);
  assert.deepEqual(filter.status, { $in: ['active', null] });
  assert.deepEqual(filter.isBlocked, { $ne: true });
  assert.deepEqual(filter.permanentlyBanned, { $ne: true });
  assert.deepEqual(filter.$or, [{ suspendedUntil: null }, { suspendedUntil: { $lte: now } }]);
});

test('register still requires policy acceptance and saves it on pending teachers', async (t) => {
  t.mock.method(User, 'exists', async () => null);
  let saved;
  t.mock.method(User.prototype, 'save', async function() { saved = this; return this; });
  const base = await appURL(t, '/api/auth', require('../routes/auth'));
  const body = { name: 'Teacher', email: 'TEACHER@example.com', password: 'Password123!', role: 'teacher' };
  const missingPolicy = await fetch(`${base}/api/auth/register`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(missingPolicy.status, 400);
  assert.equal(saved, undefined);
  const pending = await fetch(`${base}/api/auth/register`, { method: 'POST', headers,
    body: JSON.stringify({ ...body, acceptedPolicies: true }) });
  assert.equal(pending.status, 202);
  const result = await pending.json();
  assert.equal(result.token, undefined);
  assert.equal(result.user.status, 'pending');
  assert.equal(saved.email, 'teacher@example.com');
  assert.ok(saved.policiesAcceptedAt instanceof Date);
  assert.equal(saved.policyVersion, '0.1.1');
});

test('login preserves main suspension and ban response details', async (t) => {
  let account = { _id: studentId, name: 'Student', email: 'student@example.com', role: 'student',
    permanentlyBanned: true, comparePassword: async () => true };
  t.mock.method(User, 'findOne', () => query(account));
  t.mock.method(StudentWarning, 'findOne', () => query({ class: { name: 'Math' }, reasonCode: 'spam',
    details: 'Warning details', accountSanction: 'suspension_7_days' }));
  const base = await appURL(t, '/api/auth', require('../routes/auth'));
  for (const [restriction, code] of [
    [{ permanentlyBanned: true }, 403],
    [{ permanentlyBanned: false, suspendedUntil: new Date(Date.now() + 3600000) }, 423],
  ]) {
    account = { ...account, ...restriction };
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers,
      body: JSON.stringify({ email: account.email, password: 'Password123!' }) });
    assert.equal(response.status, code);
    const result = await response.json();
    assert.equal(result.restriction.className, 'Math');
    assert.equal(result.restriction.reasonCode, 'spam');
    assert.equal(result.token, undefined);
  }
});

test('profile update retains main avatar upload support and response id', async (t) => {
  t.mock.method(User, 'findById', () => query({ role: 'student', status: 'active' }));
  const profile = { _id: studentId, name: 'Student', role: 'student', email: 'student@example.com', save: async () => {} };
  t.mock.method(User, 'findOne', () => query(profile));
  const base = await appURL(t, '/api/users', require('../routes/users'));
  const avatar = `data:image/png;base64,${'a'.repeat(3000)}`;
  const response = await fetch(`${base}/api/users/profile`, { method: 'PUT', headers, body: JSON.stringify({ avatar }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.user.id, studentId);
  assert.equal(result.user.avatar, avatar);
  assert.equal(result.user.password, undefined);
});

test('new sessions endpoints respect locked classes from main', async (t) => {
  t.mock.method(Class, 'findById', () => query({ _id: classId, teacher: teacherId, students: [studentId], status: 'inactive' }));
  await assert.rejects(accessibleClass(classId, { id: studentId, role: 'student' }), { statusCode: 423 });
  await assert.rejects(accessibleClass(classId, { id: teacherId, role: 'teacher' }, true), { statusCode: 423 });
  assert.equal((await accessibleClass(classId, { id: teacherId, role: 'teacher' })).manager, true);
});

test('main join-code lookup remains available after class integration', async (t) => {
  t.mock.method(User, 'findById', () => query({ role: 'student', status: 'active' }));
  t.mock.method(Class, 'findOne', (filter) => {
    assert.equal(filter.joinCode, 'ABCD1234');
    return query({ _id: classId, name: 'Math', subject: 'Math', grade: '12', teacher: { name: 'Teacher' },
      students: [], joinRequests: [], capacity: 50 });
  });
  const base = await appURL(t, '/api/classes', require('../routes/classes'));
  const response = await fetch(`${base}/api/classes/lookup/abcd-1234`, { headers });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.name, 'Math');
  assert.equal(result.studentCount, 0);
  assert.equal(result.joinCode, undefined);
});
