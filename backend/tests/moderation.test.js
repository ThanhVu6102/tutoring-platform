const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const id = 'a'.repeat(24);
function query(data, calls = {}) {
  const q = { then(resolve, reject) { return Promise.resolve(data).then(resolve, reject); } };
  for (const key of ['select', 'populate', 'sort', 'skip', 'limit']) q[key] = (arg) => { calls[key] = arg; return q; };
  q.lean = async () => data;
  return q;
}
async function client(t, role = 'admin') {
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ role, status: 'active' }) }) }));
  const app = express();
  app.use(require('../middleware/apiPerformance'));
  app.use('/api/moderation', require('../routes/moderation'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const token = jwt.sign({ userId: id, role: 'admin' }, process.env.JWT_SECRET || 'your-secret-key');
  return async (path, authenticated = true) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/moderation/${path}`, {
      headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
}

for (const role of ['student', 'teacher']) {
  test(`moderation denies ${role}, forged role query and missing authentication before reading any records`, async (t) => {
    const request = await client(t, role);
    t.mock.method(StudentWarning, 'find', () => assert.fail('Must authorize before expiry processing'));
    for (const section of ['summary', 'warnings', 'students', 'classes']) {
      assert.equal((await request(`${section}?role=admin&userId=${id}`)).status, 403);
      assert.equal((await request(section, false)).status, 401);
    }
  });
}

test('moderation rejects invalid paging and warning status before expiry writes', async (t) => {
  const request = await client(t);
  t.mock.method(StudentWarning, 'find', () => assert.fail('Invalid query must not finalize expired warnings'));
  for (const section of ['warnings', 'students', 'classes']) {
    for (const suffix of ['page=0', 'limit=bad', 'page=1.5', 'limit[$gt]=0']) {
      assert.equal((await request(`${section}?${suffix}`)).status, 400);
    }
  }
  assert.equal((await request('warnings?status=unknown')).status, 400);
  assert.equal((await request('warnings?status[$ne]=pending')).status, 400);
});

test('summary uses complete database counts rather than a page length', async (t) => {
  const request = await client(t);
  t.mock.method(StudentWarning, 'find', () => query([]));
  t.mock.method(StudentWarning, 'countDocuments', async (filter) => filter.status ? 73 : 2500);
  t.mock.method(Class, 'countDocuments', async (filter) => {
    assert.equal(filter.$or[0].status, 'inactive');
    assert.deepEqual(filter.$or[1]['lockNotice.status'].$nin, ['none', null, '']);
    return 42;
  });
  const response = await request('summary');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { totalWarnings: 2500, openWarnings: 73, violationClasses: 42 });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('warnings support capped stable pagination, exact filter counts and safe nested actor profiles', async (t) => {
  const request = await client(t);
  const calls = {};
  const student = { _id: id, name: 'Test', email: 'test@example.test', password: 'SECRET', warningRevision: 12 };
  t.mock.method(StudentWarning, 'find', (filter) => {
    if (filter.appealDeadline) return query([]);
    assert.deepEqual(filter, { status: 'appealed' });
    return query([{ _id: id, student, status: 'appealed' }], calls);
  });
  t.mock.method(StudentWarning, 'countDocuments', async (filter) => {
    assert.deepEqual(filter, { status: 'appealed' });
    return 301;
  });
  const response = await request('warnings?page=2&limit=999&status=appealed');
  assert.equal(response.status, 200);
  assert.equal(response.body.limit, 100);
  assert.equal(response.body.total, 301);
  assert.equal(response.body.totalPages, 4);
  assert.equal(calls.skip, 100);
  assert.equal(calls.limit, 100);
  assert.deepEqual(calls.sort, { issuedAt: -1, _id: -1 });
  assert.equal(response.body.data[0].student.email, student.email);
  assert.equal(response.body.data[0].student.password, undefined);
  assert.equal(response.body.data[0].student.warningRevision, undefined);
});

test('student lookup filters eligibility before the page and exposes only approved root DTO fields', async (t) => {
  const request = await client(t);
  t.mock.method(StudentWarning, 'find', () => query([]));
  t.mock.method(User, 'aggregate', async (pipeline) => {
    assert.deepEqual(pipeline[0].$match, { role: 'student', deletedAt: null });
    assert.equal(pipeline[3].$lookup.foreignField, 'student');
    assert.equal(pipeline[3].$lookup.pipeline[0].$limit, 1);
    assert.ok(pipeline[4].$match.$or.some((condition) => condition['warningMatch.0']));
    const facet = pipeline[5].$facet;
    assert.equal(facet.data[0].$skip, 20);
    assert.equal(facet.data[1].$limit, 20);
    return [{ data: [{ _id: id, name: 'Test', password: 'SECRET', warningMatch: [id], futureSecret: 'SECRET' }],
      total: [{ count: 101 }] }];
  });
  const response = await request('students?page=2');
  assert.equal(response.status, 200);
  assert.equal(response.body.total, 101);
  assert.equal(response.body.totalPages, 6);
  assert.deepEqual(response.body.data, [{ _id: id, name: 'Test' }]);
});

test('class list remains bounded without returning history or student rosters', async (t) => {
  const request = await client(t);
  const calls = {};
  t.mock.method(StudentWarning, 'find', () => query([]));
  t.mock.method(Class, 'find', () => query([], calls));
  t.mock.method(Class, 'countDocuments', async () => 0);
  const response = await request('classes');
  assert.equal(response.status, 200);
  assert.equal(calls.limit, 20);
  assert.ok(!calls.select.includes('students'));
  assert.ok(!calls.select.includes('lockNoticeHistory'));
  assert.deepEqual(response.body, { data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
});
