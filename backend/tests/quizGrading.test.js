const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
require('./helpers/jwtEnvironment');
const User = require('../models/User');
const Class = require('../models/Class');
const Quiz = require('../models/Quiz');
const QuizSubmission = require('../models/QuizSubmission');
const ids = Object.fromEntries(['teacherA', 'teacherB', 'student', 'admin', 'classA', 'classB', 'quizA', 'quizB', 'submissionA', 'submissionB', 'questionA', 'questionB']
  .map((name, index) => [name, (index + 1).toString(16).repeat(24)]));
const query = (value) => ({ select() { return this; }, lean: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });

async function fixture(t) {
  let actor = { id: ids.teacherA, role: 'teacher', status: 'active' };
  let writes = 0;
  const classes = { [ids.classA]: { teacher: ids.teacherA, status: 'active' }, [ids.classB]: { teacher: ids.teacherB, status: 'active' } };
  const quizzes = Object.fromEntries(['A', 'B'].map((key) => [ids[`quiz${key}`], {
    _id: ids[`quiz${key}`], class: ids[`class${key}`], questions: [{ _id: ids[`question${key}`], points: 5 }],
  }]));
  const submissions = Object.fromEntries(['A', 'B'].map((key) => [ids[`submission${key}`], {
    _id: ids[`submission${key}`], quiz: ids[`quiz${key}`], class: ids[`class${key}`],
    answers: [{ questionId: ids[`question${key}`], pointsEarned: 0 }], maxScore: 5, totalScore: 0,
    async save() { writes++; },
  }]));
  t.mock.method(User, 'findById', () => query(actor));
  t.mock.method(Quiz, 'findById', (id) => query(quizzes[id]));
  t.mock.method(Class, 'findById', (id) => query(classes[id]));
  t.mock.method(QuizSubmission, 'findById', () => assert.fail('Không truy vấn bài nộp chỉ bằng ID'));
  t.mock.method(QuizSubmission, 'findOne', (filter) => {
    const record = submissions[filter._id];
    assert.ok(filter.quiz && filter.class);
    return Promise.resolve(record && record.quiz === filter.quiz && record.class === filter.class ? record : null);
  });
  const app = express();
  app.use(express.json());
  app.use('/api/quizzes', require('../routes/quizzes'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: 'Dữ liệu không hợp lệ' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { classes, quizzes, submissions, writes: () => writes,
    actor(value) { actor = value; },
    async grade(quiz = ids.quizA, submission = ids.submissionA, body = { questionIndex: 0, score: 4, feedback: 'Tốt' }, authenticated = true) {
      const token = jwt.sign({ userId: actor.id, role: 'admin' }, process.env.JWT_SECRET);
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/quizzes/${quiz}/submission/${submission}/grade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

test('chấm quiz không cho tráo bài nộp giữa hai lớp/giáo viên hoặc class sai trong bài nộp', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.grade(ids.quizA, ids.submissionB)).status, 404);
  assert.equal((await f.grade(ids.quizB, ids.submissionB)).status, 403);
  f.submissions[ids.submissionA].class = ids.classB;
  assert.equal((await f.grade()).status, 404);
  assert.equal(f.writes(), 0);
  assert.equal(f.submissions[ids.submissionB].totalScore, 0);
});

test('giáo viên phụ trách và admin chấm hợp lệ; admin giữ quyền trên lớp khóa', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.grade()).status, 200);
  assert.equal(f.submissions[ids.submissionA].totalScore, 4);
  assert.equal(f.submissions[ids.submissionA].percentage, 80);
  assert.equal(f.submissions[ids.submissionA].feedback, 'Tốt');
  f.actor({ id: ids.teacherB, role: 'teacher', status: 'active' });
  assert.equal((await f.grade(ids.quizB, ids.submissionB)).status, 200);
  f.actor({ id: ids.admin, role: 'admin', status: 'active' });
  f.classes[ids.classA].status = 'inactive';
  assert.equal((await f.grade()).status, 200);
  assert.equal(f.writes(), 3);
});

test('chấm quiz chặn học sinh, phiên thiếu, tài khoản hạn chế và giáo viên lớp khóa trước ghi', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.grade(undefined, undefined, undefined, false)).status, 401);
  f.actor({ id: ids.student, role: 'student', status: 'active' });
  assert.equal((await f.grade()).status, 403);
  f.actor({ id: ids.teacherA, role: 'teacher', status: 'active', isBlocked: true });
  assert.equal((await f.grade()).status, 403);
  f.actor({ id: ids.teacherA, role: 'teacher', status: 'active' });
  f.classes[ids.classA].status = 'inactive';
  assert.equal((await f.grade()).status, 423);
  assert.equal(f.writes(), 0);
});

test('chấm quiz validate ID, questionIndex, điểm và feedback trước khi lưu', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.grade('invalid')).status, 400);
  assert.equal((await f.grade(ids.quizA, 'invalid')).status, 400);
  for (const body of [null, [], {}, { questionIndex: -1, score: 0 }, { questionIndex: 0.5, score: 1 },
    { questionIndex: '0', score: 1 }, { questionIndex: 1, score: 1 }, { questionIndex: 0, score: -1 },
    { questionIndex: 0, score: '4' }, { questionIndex: 0, score: null }, { questionIndex: 0, score: 6 },
    { questionIndex: 0, score: 4, feedback: {} }]) {
    assert.equal((await f.grade(ids.quizA, ids.submissionA, body)).status, 400);
  }
  assert.equal(f.writes(), 0);
  assert.equal(f.submissions[ids.submissionA].answers[0].pointsEarned, 0);
});

test('chấm quiz chặn quan hệ câu hỏi/thang điểm legacy sai và tài nguyên không tồn tại', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.grade('f'.repeat(24))).status, 404);
  assert.equal((await f.grade(ids.quizA, 'f'.repeat(24))).status, 404);
  f.submissions[ids.submissionA].answers[0].questionId = ids.questionB;
  assert.equal((await f.grade()).status, 409);
  f.submissions[ids.submissionA].answers[0].questionId = ids.questionA;
  f.submissions[ids.submissionA].maxScore = 0;
  assert.equal((await f.grade()).status, 409);
  delete f.classes[ids.classA];
  assert.equal((await f.grade()).status, 404);
  assert.equal(f.writes(), 0);
});
