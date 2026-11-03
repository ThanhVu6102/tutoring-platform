const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');
const { USER_POPULATE_FIELDS, userQueryFields, userForViewer, filterUserReferences } = require('../utils/userPrivacy');

const viewerId = 'a'.repeat(24);
const otherId = 'b'.repeat(24);
const classId = 'c'.repeat(24);
const profile = {
  _id: otherId, name: 'Teacher', role: 'teacher', avatar: '/avatar.png', bio: 'Giới thiệu',
  email: 'private@example.com', phone: '0900000000', review: { note: 'Ghi chú nội bộ' },
  enrolledClasses: [classId], disciplinarySanctions: 2, status: 'active',
  password: 'secret-hash', scheduleRevision: 7, futureSecret: 'Không được tự động lộ',
  phone_number: '0900000001', id_card_number: 'fake-id-card', cccd: 'fake-cccd',
};
const publicKeys = ['_id', 'avatar', 'bio', 'name', 'role'];
const query = (value) => ({
  select() { return this; }, populate() { return this; }, sort() { return this; },
  skip() { return this; }, limit() { return this; }, lean: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

async function appURL(t, path, router, role = 'student') {
  t.mock.method(User, 'findById', () => query({ role, status: 'active' }));
  const app = express();
  app.use(express.json());
  app.use(path, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

function headers() {
  return { Authorization: `Bearer ${jwt.sign({ userId: viewerId },
    process.env.JWT_SECRET || 'your-secret-key')}` };
}

// Kiểm tra allowlist cho cả document Mongoose lẫn object thường, kể cả trường mới.
test('public profile uses an explicit allowlist without mutating the source', () => {
  const req = { userId: viewerId, userRole: 'student' };
  assert.deepEqual(Object.keys(userForViewer(profile, req)).sort(), publicKeys);
  const document = new User({ ...profile, _id: otherId });
  assert.deepEqual(Object.keys(userForViewer(document, req)).sort(), publicKeys);
  assert.equal(profile.phone, '0900000000');
});

test('self and admin retain existing private fields but never secrets or new fields', () => {
  for (const req of [
    { userId: otherId, userRole: 'teacher' },
    { userId: viewerId, userRole: 'admin' },
  ]) {
    const result = userForViewer(profile, req);
    assert.equal(result.email, profile.email);
    assert.equal(result.phone, profile.phone);
    assert.deepEqual(result.review, profile.review);
    assert.equal(result.password, undefined);
    assert.equal(result.scheduleRevision, undefined);
    assert.equal(result.futureSecret, undefined);
    assert.equal(result.phone_number, undefined);
    assert.equal(result.id_card_number, undefined);
    assert.equal(result.cccd, undefined);
  }
});

// Kiểm tra projection độc lập với DTO để tránh vô tình nạp PII ở query hồ sơ công khai.
test('profile query selects only public fields for other users and unauthenticated contexts', () => {
  for (const req of [
    { userId: viewerId, userRole: 'student' },
    { userId: viewerId, userRole: 'teacher' },
    {},
  ]) {
    assert.deepEqual(userQueryFields(req, otherId).split(' ').sort(), publicKeys);
  }
  for (const req of [
    { userId: otherId, userRole: 'teacher' },
    { userId: viewerId, userRole: 'admin' },
  ]) {
    assert.equal(userQueryFields(req, otherId), USER_POPULATE_FIELDS);
    const fields = userQueryFields(req, otherId).split(' ');
    for (const secret of ['password', 'scheduleRevision', 'phone_number', 'id_card_number', 'cccd']) {
      assert.equal(fields.includes(secret), false);
    }
  }
});

test('uppercase ObjectId in a self-profile URL retains the same private projection', () => {
  assert.equal(userQueryFields({ userId: viewerId, userRole: 'student' }, viewerId.toUpperCase()),
    USER_POPULATE_FIELDS);
});

test('private DTO keeps reviewed metadata but omits new nested review fields', () => {
  const reviewedAt = new Date();
  const input = { ...profile, review: { reviewedBy: otherId, reviewedAt,
    note: 'Đã duyệt', id_card_number: 'fake-id-card', futureSecret: 'Không được phép' } };
  for (const req of [
    { userId: otherId, userRole: 'teacher' },
    { userId: viewerId, userRole: 'admin' },
  ]) {
    assert.deepEqual(userForViewer(input, req).review,
      { reviewedBy: otherId, reviewedAt, note: 'Đã duyệt' });
  }
  assert.equal(input.review.futureSecret, 'Không được phép');
});

test('public teacher and student DTOs reject identity aliases for every non-admin role', () => {
  for (const targetRole of ['teacher', 'student']) {
    for (const viewerRole of ['student', 'teacher']) {
      const result = userForViewer({ ...profile, role: targetRole,
        phoneNumber: '0900000002', idCardNumber: 'fake-id-card', identityNumber: 'fake-id' },
      { userId: viewerId, userRole: viewerRole });
      assert.deepEqual(Object.keys(result).sort(), publicKeys);
      assert.equal(result.role, targetRole);
    }
  }
});

test('nested users, arrays and review references are filtered while IDs and dates survive', () => {
  const id = new mongoose.Types.ObjectId(otherId);
  const date = new Date();
  const data = { teacher: profile, students: [profile, id, null],
    joinRequests: [{ student: profile }], issuedBy: profile, createdAt: date };
  const result = filterUserReferences(data, { userId: viewerId, userRole: 'teacher' });
  for (const user of [result.teacher, result.students[0], result.joinRequests[0].student, result.issuedBy]) {
    assert.deepEqual(Object.keys(user).sort(), publicKeys);
  }
  assert.equal(result.students[1], id);
  assert.equal(result.students[2], null);
  assert.equal(result.createdAt, date);
  const own = userForViewer({ ...profile, _id: viewerId, review: { reviewedBy: profile } },
    { userId: viewerId, userRole: 'student' });
  assert.equal(own.review.reviewedBy.email, undefined);
});

for (const [role, target, privateAccess] of [
  ['student', otherId, false], ['teacher', otherId, false],
  ['student', viewerId, true], ['admin', otherId, true],
]) {
  test(`GET user profile: ${role}, ${privateAccess ? 'private' : 'public'}`, async (t) => {
    let selected;
    t.mock.method(User, 'findOne', () => ({ ...query({ ...profile, _id: target }),
      select(fields) { selected = fields; return this; } }));
    const base = await appURL(t, '/api/users', require('../routes/users'), role);
    const response = await fetch(`${base}/api/users/${target}`, { headers: headers() });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.email, privateAccess ? profile.email : undefined);
    assert.equal(body.phone, privateAccess ? profile.phone : undefined);
    assert.equal(body.password, undefined);
    assert.equal(body.scheduleRevision, undefined);
    assert.equal(body.futureSecret, undefined);
    assert.equal(body.phone_number, undefined);
    assert.equal(body.id_card_number, undefined);
    assert.equal(body.cccd, undefined);
    assert.equal(selected, userQueryFields({ userId: viewerId, userRole: role }, target));
    if (!privateAccess) assert.deepEqual(Object.keys(body).sort(), publicKeys);
  });
}

test('own profile and both admin list formats retain existing private data safely', async (t) => {
  t.mock.method(User, 'findOne', () => query({ ...profile, _id: viewerId }));
  t.mock.method(User, 'find', () => query([profile]));
  t.mock.method(User, 'countDocuments', async () => 1);
  const base = await appURL(t, '/api/users', require('../routes/users'), 'admin');
  for (const path of ['/profile', '', '?page=1&limit=20']) {
    const response = await fetch(`${base}/api/users${path}`, { headers: headers() });
    assert.equal(response.status, 200);
    const body = await response.json();
    const user = path === '/profile' ? body : (Array.isArray(body) ? body[0] : body.data[0]);
    assert.equal(user.phone, profile.phone);
    assert.deepEqual(user.review, profile.review);
    assert.equal(user.password, undefined);
    assert.equal(user.futureSecret, undefined);
  }
});

test('student own-profile endpoint retains phone and approved review metadata', async (t) => {
  let selected;
  t.mock.method(User, 'findOne', () => ({ ...query({ ...profile, _id: viewerId, role: 'student' }),
    select(fields) { selected = fields; return this; } }));
  const base = await appURL(t, '/api/users', require('../routes/users'));
  const response = await fetch(`${base}/api/users/profile`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(selected, USER_POPULATE_FIELDS);
  assert.equal(body.phone, profile.phone);
  assert.deepEqual(body.review, profile.review);
  assert.equal(body.id_card_number, undefined);
});

// Test qua HTTP để bảo đảm middleware thật sự chặn hồ sơ lồng trong từng router.
for (const [route, model] of [
  ['announcements', 'Announcement'], ['assignments', 'Assignment'],
  ['documents', 'Document'], ['videos', 'Video'], ['quizzes', 'Quiz'],
]) {
  test(`${route} detail strips private teacher fields from the HTTP payload`, async (t) => {
    const Model = require(`../models/${model}`);
    const resource = { _id: otherId, class: classId, status: 'published',
      teacher: profile, questions: [], title: 'Bài học' };
    t.mock.method(Model, 'findById', () => query({ ...resource, toObject: () => ({ ...resource }) }));
    t.mock.method(Class, 'findById', () => query({ status: 'active', teacher: otherId, students: [viewerId] }));
    const base = await appURL(t, `/api/${route}`, require(`../routes/${route}`));
    const response = await fetch(`${base}/api/${route}/${otherId}`, { headers: headers() });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body.teacher).sort(), publicKeys);
    for (const field of ['email', 'phone', 'phone_number', 'id_card_number', 'cccd', 'review']) {
      assert.equal(body.teacher[field], undefined);
    }
  });
}

test('class roster hides student emails from teachers but retains them for admin', async (t) => {
  t.mock.method(Class, 'findById', () => query({ _id: classId, teacher: viewerId,
    students: [profile], status: 'active' }));
  let role = 'teacher';
  const base = await appURL(t, '/api/classes', require('../routes/classes'), role);
  t.mock.method(User, 'findById', () => query({ role, status: 'active' }));
  for (const currentRole of ['teacher', 'admin']) {
    role = currentRole;
    const response = await fetch(`${base}/api/classes/${classId}/students`, { headers: headers() });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body[0].email, role === 'admin' ? profile.email : undefined);
    assert.equal(body[0].password, undefined);
  }
});

test('join requests hide applicant email from teachers and keep it for admin', async (t) => {
  t.mock.method(Class, 'findById', () => query({ _id: classId, teacher: viewerId,
    joinRequests: [{ student: profile }] }));
  const base = await appURL(t, '/api/classes', require('../routes/classes'));
  let role = 'teacher';
  t.mock.method(User, 'findById', () => query({ role, status: 'active' }));
  for (const currentRole of ['teacher', 'admin']) {
    role = currentRole;
    const response = await fetch(`${base}/api/classes/${classId}/join-requests`, { headers: headers() });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body[0].student.email, role === 'admin' ? profile.email : undefined);
    assert.equal(body[0].student.password, undefined);
  }
});

test('quiz submissions expose only public student profiles to the teacher', async (t) => {
  const Quiz = require('../models/Quiz');
  const QuizSubmission = require('../models/QuizSubmission');
  t.mock.method(Quiz, 'findById', () => query({ class: classId }));
  t.mock.method(Class, 'findById', () => query({ teacher: viewerId, status: 'active' }));
  t.mock.method(QuizSubmission, 'find', () => query([{ student: profile, totalScore: 9 }]));
  const base = await appURL(t, '/api/quizzes', require('../routes/quizzes'), 'teacher');
  const response = await fetch(`${base}/api/quizzes/${otherId}/submissions`, { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body[0].student).sort(), publicKeys);
  assert.equal(body[0].totalScore, 9);
});

test('unauthenticated callers still cannot read profiles', async (t) => {
  const base = await appURL(t, '/api/users', require('../routes/users'));
  const response = await fetch(`${base}/api/users/${otherId}`);
  assert.equal(response.status, 401);
});

test('query parameters cannot request private fields or impersonate an admin viewer', async (t) => {
  let selected;
  t.mock.method(User, 'findOne', () => ({ ...query(profile),
    select(fields) { selected = fields; return this; } }));
  const base = await appURL(t, '/api/users', require('../routes/users'));
  const response = await fetch(`${base}/api/users/${otherId}?role=admin&userId=${otherId}&fields=email,phone,id_card_number`,
    { headers: headers() });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(await response.json()).sort(), publicKeys);
  assert.deepEqual(selected.split(' ').sort(), publicKeys);
});
