const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const { userForViewer, filterUserReferences } = require('../utils/userPrivacy');
const { classAppealsForViewer } = require('../utils/classLockNotices');

const ids = { actor: 'a'.repeat(24), class: 'b'.repeat(24), warning: 'c'.repeat(24), other: 'd'.repeat(24) };
const query = (value) => ({
  select() { return this; }, lean: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

async function appClient(t, role = 'admin') {
  t.mock.method(User, 'findById', () => query({ _id: ids.actor, role, status: 'active' }));
  const app = express();
  app.use(express.json());
  app.use('/api/student-warnings', require('../routes/studentWarnings'));
  app.use('/api/classes', require('../routes/classes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  // Token cố ý ghi role admin: quyền thực tế vẫn phải lấy từ database.
  const token = jwt.sign({ userId: ids.actor, role: 'admin' }, process.env.JWT_SECRET || 'your-secret-key');
  return async (method, path, body, authenticated = true) => {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, body: await result.json() };
  };
}

const warningURL = `/student-warnings/${ids.warning}`;
const classURL = `/classes/${ids.class}`;
const validNotice = { reasonCode: 'spam', policyLevel: '1', details: 'Bằng chứng kiểm thử' };

test('appeal and review HTTP endpoints reject unauthenticated callers before reading records', async (t) => {
  const request = await appClient(t);
  t.mock.method(Class, 'findById', () => assert.fail('Must authenticate first'));
  for (const [method, url] of [
    ['POST', `${warningURL}/appeal`], ['PATCH', `${warningURL}/review`],
    ['POST', `${classURL}/lock-appeal`], ['PATCH', `${classURL}/lock-notice`],
    ['PATCH', `${classURL}/lock-review`], ['PATCH', `${classURL}/status`],
    ['GET', '/student-warnings/mine'], ['GET', '/student-warnings'],
  ]) assert.equal((await request(method, url, undefined, false)).status, 401);
});

for (const role of ['student', 'teacher']) {
  test(`${role} cannot review or issue sanctions even with an admin role in the token`, async (t) => {
    const request = await appClient(t, role);
    t.mock.method(Class, 'findById', () => assert.fail('Role must be checked before resource access'));
    for (const url of [`${warningURL}/review`, `${classURL}/lock-review`, `${classURL}/lock-notice`, `${classURL}/status`]) {
      assert.equal((await request('PATCH', url, {})).status, 403);
    }
    assert.equal((await request('GET', '/student-warnings')).status, 403);
    assert.equal((await request('POST', `/student-warnings/${ids.other}`, validNotice)).status, 403);
    const wrongAppeal = role === 'student' ? `${classURL}/lock-appeal` : `${warningURL}/appeal`;
    assert.equal((await request('POST', wrongAppeal, { message: 'Nội dung' })).status, 403);
  });
}

test('notice HTTP validation rejects malformed types and IDs before database writes', async (t) => {
  const request = await appClient(t);
  t.mock.method(Class, 'findById', () => assert.fail('Invalid input must not query class'));
  t.mock.method(StudentWarning, 'create', () => assert.fail('Invalid input must not create warning'));
  for (const input of [[], {}, { ...validNotice, details: 123 }, { ...validNotice, details: [] },
    { ...validNotice, details: ' ' }, { ...validNotice, details: 'x'.repeat(2001) },
    { ...validNotice, policyLevel: true }, { ...validNotice, policyLevel: [1] },
    { ...validNotice, reasonCode: { $ne: null } }]) {
    assert.equal((await request('PATCH', `${classURL}/lock-notice`, input)).status, 400);
    assert.equal((await request('POST', `/student-warnings/${ids.other}`, { ...input, classId: ids.class })).status, 400);
  }
  assert.equal((await request('PATCH', '/classes/invalid/lock-notice', validNotice)).status, 400);
  assert.equal((await request('POST', '/student-warnings/invalid', { ...validNotice, classId: ids.class })).status, 400);
  assert.equal((await request('POST', `/student-warnings/${ids.other}`, { ...validNotice, classId: { $ne: null } })).status, 400);
});

for (const role of ['student', 'teacher']) {
  test(`${role} appeal rejects non-text, empty, oversized payloads and malformed IDs`, async (t) => {
    const request = await appClient(t, role);
    t.mock.method(Class, 'findById', () => assert.fail('Invalid appeal must not read class'));
    t.mock.method(StudentWarning, 'findOneAndUpdate', () => assert.fail('Invalid appeal must not write warning'));
    const url = role === 'student' ? `${warningURL}/appeal` : `${classURL}/lock-appeal`;
    for (const message of [undefined, null, false, 7, [], {}, ' ', 'x'.repeat(3001)]) {
      assert.equal((await request('POST', url, { message })).status, 400);
    }
    assert.equal((await request('POST', url, [])).status, 400);
    const invalid = role === 'student' ? '/student-warnings/invalid/appeal' : '/classes/invalid/lock-appeal';
    assert.equal((await request('POST', invalid, { message: 'Hợp lệ' })).status, 400);
  });
}

test('review validation rejects invalid response types and oversized text before transaction', async (t) => {
  const request = await appClient(t);
  t.mock.method(mongoose, 'startSession', () => assert.fail('Invalid review must not start transaction'));
  t.mock.method(Class, 'findById', () => assert.fail('Invalid review must not read class'));
  for (const response of [null, 3, {}, [], 'x'.repeat(2001)]) {
    assert.equal((await request('PATCH', `${warningURL}/review`, { decision: 'confirm', response })).status, 400);
    assert.equal((await request('PATCH', `${classURL}/lock-review`, { decision: 'lock', response })).status, 400);
  }
  for (const decision of [undefined, 'accepted', [], { $ne: null }]) {
    assert.equal((await request('PATCH', `${warningURL}/review`, { decision })).status, 400);
    assert.equal((await request('PATCH', `${classURL}/lock-review`, { decision })).status, 400);
  }
});

test('warning appeal does not reveal another student record and reports terminal state conflicts', async (t) => {
  const request = await appClient(t, 'student');
  let exists = null;
  t.mock.method(StudentWarning, 'findOneAndUpdate', async (filter) => {
    assert.equal(filter.student, ids.actor);
    return null;
  });
  t.mock.method(StudentWarning, 'exists', async (filter) => {
    assert.equal(filter.student, ids.actor);
    return exists;
  });
  assert.equal((await request('POST', `${warningURL}/appeal`, { message: 'Kháng cáo' })).status, 404);
  exists = { _id: ids.warning };
  assert.equal((await request('POST', `${warningURL}/appeal`, { message: 'Kháng cáo' })).status, 409);
});

test('unrelated teacher cannot submit an appeal or replace its author', async (t) => {
  const request = await appClient(t, 'teacher');
  t.mock.method(Class, 'findById', () => query({ teacher: ids.other, status: 'active' }));
  t.mock.method(Class, 'findOneAndUpdate', () => assert.fail('Must not write another teacher appeal'));
  const result = await request('POST', `${classURL}/lock-appeal`, { message: 'Kháng cáo', teacher: ids.actor });
  assert.equal(result.status, 403);
});

test('class appeal rejects expired or missing deadlines instead of accepting invalid legacy notices', async (t) => {
  const request = await appClient(t, 'teacher');
  let deadline;
  t.mock.method(Class, 'findById', () => query({ teacher: ids.actor, status: 'active',
    lockNotice: { status: 'pending', appealDeadline: deadline } }));
  t.mock.method(Class, 'findOneAndUpdate', () => assert.fail('Closed deadline must not be written'));
  for (const value of [undefined, null, new Date(0), new Date(NaN)]) {
    deadline = value;
    assert.equal((await request('POST', `${classURL}/lock-appeal`, { message: 'Kháng cáo' })).status, 409);
  }
});

test('transaction-required review returns 503 and never retries with independent writes', async (t) => {
  const request = await appClient(t);
  let ended = false;
  t.mock.method(mongoose, 'startSession', async () => ({
    withTransaction: async () => { throw Object.assign(new Error('standalone'), { code: 20 }); },
    endSession: async () => { ended = true; },
  }));
  t.mock.method(StudentWarning, 'findOneAndUpdate', () => assert.fail('No nontransactional fallback'));
  const result = await request('PATCH', `${warningURL}/review`, { decision: 'confirm' });
  assert.equal(result.status, 503);
  assert.equal(ended, true);
});

test('unexpected database errors do not expose internal details through appeal endpoints', async (t) => {
  const request = await appClient(t, 'student');
  t.mock.method(console, 'error', () => {});
  t.mock.method(StudentWarning, 'findOneAndUpdate', async () => { throw new Error('PRIVATE_DATABASE_DETAIL'); });
  const result = await request('POST', `${warningURL}/appeal`, { message: 'Kháng cáo' });
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(result.body).includes('PRIVATE_DATABASE_DETAIL'));
});

test('class appeal privacy preserves status and does not mutate the manager record', () => {
  const cls = { lockNotice: { status: 'appealed', appealMessage: 'Riêng tư', adminResponse: 'Riêng tư', issuedBy: ids.other },
    lockNoticeHistory: [{ appealMessage: 'Lịch sử riêng tư' }], lockRevision: 3 };
  const studentView = classAppealsForViewer(cls, 'student');
  assert.deepEqual(studentView, { lockNotice: { status: 'appealed' } });
  assert.equal(classAppealsForViewer(cls, 'teacher'), cls);
  assert.equal(classAppealsForViewer(cls, 'admin'), cls);
  assert.equal(cls.lockNotice.appealMessage, 'Riêng tư');
});

test('new actor references and internal warning lock remain covered by profile privacy', () => {
  const actor = { _id: ids.other, name: 'Tên', role: 'teacher', email: 'private@example.com', warningRevision: 9 };
  const req = { userId: ids.actor, userRole: 'student' };
  const filtered = filterUserReferences({ appealedBy: actor, reopenedBy: actor, reviewedBy: actor }, req);
  for (const value of Object.values(filtered)) assert.deepEqual(Object.keys(value).sort(), ['_id', 'name', 'role']);
  assert.equal(userForViewer(actor, { userRole: 'admin' }).warningRevision, undefined);
});

test('optional appeal metadata preserves legacy class records without inventing actors', () => {
  const data = { name: 'Lớp test', subject: 'Toán', teacher: ids.actor,
    lockNotice: { status: 'pending', details: 'Lý do', appealDeadline: new Date() } };
  assert.equal(new Class(data).validateSync(), undefined);
  const legacy = new Class({ ...data, lockNoticeHistory: [{ status: 'locked', adminResponse: 'x'.repeat(2001) }] });
  assert.equal(legacy.validateSync(), undefined);
  assert.equal(legacy.lockNoticeHistory[0].reviewedBy, undefined);
  assert.equal(new StudentWarning({ student: ids.actor, class: ids.class, issuedBy: ids.other,
    ...validNotice, appealDeadline: new Date() }).validateSync(), undefined);
});
