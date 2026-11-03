const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pagination, readPage } = require('../utils/pagination');
const { cachedConnection } = require('../utils/mongoConnection');
const User = require('../models/User');
const Class = require('../models/Class');
const viewerId = 'a'.repeat(24);
const classId = 'b'.repeat(24);

// Query giả ghi lại thao tác để chứng minh limit/projection được gửi xuống DB.
function query(value, calls = {}) {
  const chain = { then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
  for (const method of ['select', 'sort', 'skip', 'limit', 'populate']) {
    chain[method] = (arg) => { calls[method] = arg; return chain; };
  }
  chain.lean = async () => { calls.lean = true; return value; };
  return chain;
}

async function appURL(t, prefix, router, role = 'student') {
  t.mock.method(User, 'findById', () => query({ role, status: 'active' }));
  const app = express();
  app.use(require('../middleware/apiPerformance'));
  app.use(prefix, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
const headers = () => ({ Authorization: `Bearer ${jwt.sign({ userId: viewerId }, process.env.JWT_SECRET || 'your-secret-key')}` });

test('pagination defaults, caps and rejects malformed values', () => {
  assert.deepEqual(pagination(), { page: 1, limit: 20 });
  assert.deepEqual(pagination({ page: '2', limit: '5000' }), { page: 2, limit: 100 });
  for (const value of ['0', '-1', '2.5', '2x', '', '9007199254740992', ['2'], { $gt: 1 }]) {
    assert.throws(() => pagination({ page: value }), { statusCode: 400 });
    assert.throws(() => pagination({ limit: value }), { statusCode: 400 });
  }
});

test('readPage uses bounded lean queries and the same permission filter for count', async () => {
  const calls = {};
  const filter = { teacher: viewerId };
  const Model = { find(got) { assert.equal(got, filter); return query([{ name: 'Lớp' }], calls); },
    countDocuments: async (got) => { assert.equal(got, filter); return 42; } };
  const result = await readPage(Model, { query: { page: '2', limit: '10' } }, filter, { select: 'name' });
  assert.equal(calls.skip, 10);
  assert.equal(calls.limit, 10);
  assert.equal(calls.lean, true);
  assert.equal(calls.select, 'name');
  assert.deepEqual(calls.sort, { createdAt: -1, _id: -1 });
  assert.equal(result.total, 42);
  assert.equal(result.totalPages, 5);
});

test('sort/filter indexes are declared without connecting to a database', () => {
  for (const name of ['Class', 'User', 'Video', 'Document', 'Assignment', 'Announcement', 'Quiz']) {
    const indexes = require(`../models/${name}`).schema.indexes();
    assert.ok(indexes.some(([keys]) => Object.hasOwn(keys, '_id')), `${name} needs a stable pagination index`);
  }
});

for (const role of ['student', 'teacher', 'admin']) {
  test(`class list preserves ${role} filter without populating student rosters`, async (t) => {
    let pipeline;
    let countFilter;
    let populate;
    t.mock.method(Class, 'aggregate', (steps) => { pipeline = steps; return Promise.resolve([]); });
    t.mock.method(Class, 'countDocuments', async (filter) => { countFilter = filter; return 0; });
    t.mock.method(Class, 'populate', async (data, options) => { populate = options; return data; });
    const base = await appURL(t, '/api/classes', require('../routes/classes'), role);
    const response = await fetch(`${base}/api/classes?status=inactive&page=2&limit=10`, { headers: headers() });
    assert.equal(response.status, 200);
    const match = pipeline[0].$match;
    if (role === 'student') { assert.equal(String(match.students), viewerId); assert.equal(match.status, 'active'); }
    if (role === 'teacher') assert.equal(String(match.teacher), viewerId);
    if (role === 'admin') assert.equal(match.teacher, undefined);
    assert.deepEqual(countFilter, match);
    assert.equal(pipeline[2].$skip, 10);
    assert.equal(pipeline[3].$limit, 10);
    assert.equal(pipeline[4].$project.students, undefined);
    assert.equal(pipeline[4].$project.joinRequests, undefined);
    assert.equal(populate.path, 'teacher');
    const body = await response.json();
    assert.equal(body.page, 2);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('server-timing'), /^app;dur=\d/);
  });
}

test('admin class summary uses global counts instead of the current page size', async (t) => {
  t.mock.method(Class, 'aggregate', async () => [{ name: 'Một lớp trên trang' }]);
  t.mock.method(Class, 'populate', async (data) => data);
  t.mock.method(Class, 'countDocuments', async (filter) => filter.status === 'active' ? 40 : filter.status === 'inactive' ? 2 : 42);
  const base = await appURL(t, '/api/classes', require('../routes/classes'), 'admin');
  const response = await fetch(`${base}/api/classes?summary=true`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.deepEqual(body.summary, { total: 42, active: 40, inactive: 2 });
});

for (const [route, name, heavy] of [
  ['videos', 'Video', 'viewedBy'], ['documents', 'Document', 'downloadedBy'],
  ['assignments', 'Assignment', 'submissions'], ['announcements', 'Announcement', 'readBy'],
]) {
  test(`${route} list has pagination and excludes heavy history fields`, async (t) => {
    const Model = require(`../models/${name}`);
    const calls = {};
    t.mock.method(Model, 'find', () => query([], calls));
    t.mock.method(Model, 'countDocuments', async () => 120);
    t.mock.method(Class, 'findById', () => query({ teacher: viewerId, students: [viewerId], status: 'active' }));
    const base = await appURL(t, `/api/${route}`, require(`../routes/${route}`));
    const response = await fetch(`${base}/api/${route}/class/${classId}`, { headers: headers() });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 120);
    assert.equal(body.totalPages, 6);
    assert.equal(calls.limit, 20);
    assert.equal(calls.lean, true);
    assert.equal(calls.select.split(' ').includes(heavy), false);
    assert.equal(calls.populate, undefined);
    const invalid = await fetch(`${base}/api/${route}/class/${classId}?limit=bad`, { headers: headers() });
    assert.equal(invalid.status, 400);
  });
}

test('student quiz list filters published quizzes and projects counts instead of answers/images', async (t) => {
  const Quiz = require('../models/Quiz');
  let pipeline;
  t.mock.method(Quiz, 'aggregate', (steps) => { pipeline = steps; return Promise.resolve([{ questionCount: 3, hasPromptImage: true }]); });
  t.mock.method(Quiz, 'countDocuments', async () => 1);
  t.mock.method(Class, 'findById', () => query({ teacher: viewerId, students: [viewerId], status: 'active' }));
  const base = await appURL(t, '/api/quizzes', require('../routes/quizzes'));
  const response = await fetch(`${base}/api/quizzes/class/${classId}`, { headers: headers() });
  assert.equal(response.status, 200);
  assert.equal(pipeline[0].$match.status, 'published');
  const projection = pipeline.at(-1).$project;
  assert.equal(projection.questions, undefined);
  assert.equal(projection.promptImage, undefined);
  assert.deepEqual(projection.questionCount, { $size: { $ifNull: ['$questions', []] } });
});

test('content totals respect membership and only count published quizzes for students', async (t) => {
  let member = true;
  let quizFilter;
  t.mock.method(Class, 'findById', () => query({ teacher: classId, students: member ? [viewerId] : [], status: 'active' }));
  for (const name of ['Video', 'Document', 'Assignment']) {
    t.mock.method(require(`../models/${name}`), 'countDocuments', async () => 125);
  }
  t.mock.method(require('../models/Quiz'), 'countDocuments', async (filter) => { quizFilter = filter; return 20; });
  const base = await appURL(t, '/api/classes', require('../routes/classes'));
  const response = await fetch(`${base}/api/classes/${classId}/content-summary`, { headers: headers() });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).videos, 125);
  assert.deepEqual(quizFilter, { class: classId, status: 'published' });
  member = false;
  const denied = await fetch(`${base}/api/classes/${classId}/content-summary`, { headers: headers() });
  assert.equal(denied.status, 403);
});

test('content totals reject stale class relationships after an account role change', async (t) => {
  let role = 'teacher';
  let cls = { teacher: classId, students: [viewerId], status: 'active' };
  t.mock.method(Class, 'findById', () => query(cls));
  const base = await appURL(t, '/api/classes', require('../routes/classes'), role);
  t.mock.method(User, 'findById', () => query({ role, status: 'active' }));
  assert.equal((await fetch(`${base}/api/classes/${classId}/content-summary`, { headers: headers() })).status, 403);
  role = 'student';
  cls = { teacher: viewerId, students: [], status: 'active' };
  assert.equal((await fetch(`${base}/api/classes/${classId}/content-summary`, { headers: headers() })).status, 403);
});

test('cold-start callers share both connect and initialization; warm calls do neither again', async () => {
  const state = {};
  let connections = 0;
  let initializations = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const connect = cachedConnection(state, async () => { connections++; return 'connection'; },
    async () => { initializations++; await gate; });
  const first = connect();
  const second = connect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connections, 1);
  assert.equal(initializations, 1);
  assert.equal(state.conn, undefined);
  release();
  assert.deepEqual(await Promise.all([first, second]), ['connection', 'connection']);
  assert.equal(await connect(), 'connection');
  assert.equal(initializations, 1);
});

test('failed connection retries while failed initialization keeps existing best-effort behavior', async () => {
  let attempts = 0;
  let warnings = 0;
  const connect = cachedConnection({}, async () => {
    if (++attempts === 1) throw new Error('offline');
    return 'connected';
  }, async () => { throw new Error('initialization failed'); }, () => { warnings++; });
  await assert.rejects(connect(), /offline/);
  assert.equal(await connect(), 'connected');
  assert.equal(warnings, 1);
});
