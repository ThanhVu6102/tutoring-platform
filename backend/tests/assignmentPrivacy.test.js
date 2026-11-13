const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
require('./helpers/jwtEnvironment');
const User = require('../models/User');
const Class = require('../models/Class');
const Assignment = require('../models/Assignment');
const { assignmentForViewer } = require('../utils/assignmentPrivacy');
const ids = Object.fromEntries(['teacher', 'otherTeacher', 'studentA', 'studentB', 'outsider', 'admin', 'class', 'assignment']
  .map((name, index) => [name, (index + 1).toString(16).repeat(24)]));
const query = (value) => ({ select() { return this; }, populate() { return this; }, sort() { return this; },
  skip() { return this; }, limit() { return this; }, lean: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });

async function fixture(t) {
  let actor = { id: ids.studentA, role: 'student', status: 'active' };
  let cls = { teacher: ids.teacher, students: [ids.studentA, ids.studentB], status: 'active' };
  let saves = 0;
  const assignment = { _id: ids.assignment, class: ids.class, teacher: ids.teacher,
    title: 'Bài tập', description: 'Nội dung', totalPoints: 10, dueDate: new Date(Date.now() + 86400000),
    submissions: ['A', 'B'].map((key) => ({ student: ids[`student${key}`], fileUrl: `https://example.test/${key}.pdf`,
      score: key === 'A' ? 7 : 9, feedback: `Nhận xét riêng ${key}` })),
    async save() { saves++; },
  };
  t.mock.method(User, 'findById', () => query(actor));
  t.mock.method(Class, 'findById', () => query(cls));
  t.mock.method(Assignment, 'findById', () => query(assignment));
  t.mock.method(Assignment, 'find', () => ({ ...query([{ title: assignment.title, totalPoints: assignment.totalPoints }]),
    select(fields) { assert.ok(!fields.split(' ').includes('submissions')); return this; } }));
  t.mock.method(Assignment, 'countDocuments', async () => 1);
  const app = express();
  app.use(express.json());
  app.use('/api/assignments', require('../routes/assignments'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { assignment, saves: () => saves, actor(id, role) { actor = { id, role, status: 'active' }; },
    cls(value) { cls = value; },
    async request(route = `/${ids.assignment}`, body) {
      const token = jwt.sign({ userId: actor.id, role: 'admin' }, process.env.JWT_SECRET);
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/assignments${route}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

test('hai học sinh chỉ nhận bài nộp của mình qua HTTP, query giả quyền không mở rộng dữ liệu', async (t) => {
  const f = await fixture(t);
  for (const key of ['A', 'B']) {
    f.actor(ids[`student${key}`], 'student');
    const result = await f.request(`/${ids.assignment}?role=admin&userId=${ids.admin}&fields=submissions`);
    assert.equal(result.status, 200);
    assert.equal(result.body.submissions.length, 1);
    assert.equal(result.body.submissions[0].fileUrl, `https://example.test/${key}.pdf`);
    assert.equal(result.body.submissions[0].feedback, `Nhận xét riêng ${key}`);
    assert.equal(JSON.stringify(result.body).includes(`https://example.test/${key === 'A' ? 'B' : 'A'}.pdf`), false);
  }
  assert.equal(f.assignment.submissions.length, 2);
  assert.equal(f.saves(), 0);
});

test('giáo viên phụ trách/admin nhận đủ bài nộp; mọi role chỉ nhận metadata trên danh sách', async (t) => {
  const f = await fixture(t);
  for (const [id, role] of [[ids.teacher, 'teacher'], [ids.admin, 'admin'], [ids.studentA, 'student'], [ids.studentB, 'student']]) {
    f.actor(id, role);
    const detail = await f.request();
    assert.equal(detail.status, 200);
    assert.equal(detail.body.submissions.length, role === 'student' ? 1 : 2);
    const list = await f.request(`/class/${ids.class}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data[0].submissions, undefined);
    assert.equal(list.body.total, 1);
  }
});

test('bài tập từ chối học sinh ngoài lớp, giáo viên khác, lớp thiếu/khóa', async (t) => {
  const f = await fixture(t);
  for (const [id, role] of [[ids.outsider, 'student'], [ids.otherTeacher, 'teacher']]) {
    f.actor(id, role);
    assert.equal((await f.request()).status, 403);
    assert.equal((await f.request(`/class/${ids.class}`)).status, 403);
  }
  f.actor(ids.studentA, 'student');
  f.cls({ teacher: ids.teacher, students: [ids.studentA], status: 'inactive' });
  assert.equal((await f.request()).status, 423);
  f.cls(null);
  assert.equal((await f.request()).status, 404);
  assert.equal((await f.request(`/class/${ids.class}`)).status, 404);
  assert.equal(f.saves(), 0);
});

test('lọc DTO giữ nguyên dữ liệu gốc, hỗ trợ student populate và trả rỗng khi chưa nộp', () => {
  const original = { submissions: [{ student: { _id: ids.studentA, name: 'A' }, fileUrl: 'https://example.test/A' },
    { student: ids.studentB, fileUrl: 'https://example.test/B' }] };
  assert.equal(assignmentForViewer(original, { userRole: 'student', userId: ids.studentA }).submissions.length, 1);
  assert.deepEqual(assignmentForViewer(original, { userRole: 'student', userId: ids.outsider }).submissions, []);
  assert.equal(original.submissions.length, 2);
});

test('luồng API nộp/chấm giữ response message và không làm mất bài nộp người khác', async (t) => {
  const f = await fixture(t);
  const other = { ...f.assignment.submissions[1] };
  const submit = await f.request(`/${ids.assignment}/submit`, { fileUrl: 'https://example.test/A-new.pdf' });
  assert.equal(submit.status, 200);
  assert.deepEqual(Object.keys(submit.body), ['message']);
  assert.deepEqual(f.assignment.submissions[1], other);
  f.actor(ids.teacher, 'teacher');
  const grade = await f.request(`/${ids.assignment}/grade`, { studentId: ids.studentA, score: 8, feedback: 'Đã chấm' });
  assert.equal(grade.status, 200);
  assert.deepEqual(Object.keys(grade.body), ['message']);
  assert.equal(f.assignment.submissions[0].score, 8);
  assert.deepEqual(f.assignment.submissions[1], other);
  f.actor(ids.studentB, 'student');
  assert.equal((await f.request(`/${ids.assignment}/grade`, { studentId: ids.studentA, score: 10 })).status, 403);
  assert.equal(f.saves(), 2);
});

test('API bài tập từ chối URL/điểm sai và bài nộp không tồn tại trước khi ghi', async (t) => {
  const f = await fixture(t);
  const original = JSON.stringify(f.assignment.submissions);
  for (const fileUrl of ['javascript:alert(1)', '', null, {}, 'relative.pdf']) {
    assert.equal((await f.request(`/${ids.assignment}/submit`, { fileUrl })).status, 400);
  }
  f.actor(ids.teacher, 'teacher');
  for (const score of [-1, 11, null, '5']) {
    assert.equal((await f.request(`/${ids.assignment}/grade`, { studentId: ids.studentA, score })).status, 400);
  }
  assert.equal((await f.request(`/${ids.assignment}/grade`, { studentId: ids.outsider, score: 5 })).status, 404);
  assert.equal(f.saves(), 0);
  assert.equal(JSON.stringify(f.assignment.submissions), original);
});
