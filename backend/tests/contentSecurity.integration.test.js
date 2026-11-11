const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Class = require('../models/Class');
const Quiz = require('../models/Quiz');
const QuizSubmission = require('../models/QuizSubmission');

// URI test tường minh; không nạp .env/server hoặc ghi vào DB ứng dụng.
test('bảo mật học liệu trên MongoDB thật', { timeout: 120000 }, async (t) => {
  const uri = process.env.CONTENT_SECURITY_TEST_MONGODB_URI;
  assert.ok(uri, 'Cần CONTENT_SECURITY_TEST_MONGODB_URI của replica set test được phép');
  const database = `content_security_test_${crypto.randomBytes(12).toString('hex')}`;
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  let server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    try { if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); }
    finally {
      await mongoose.disconnect();
      if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
    }
  });
  await mongoose.connect(uri, { dbName: database, serverSelectionTimeoutMS: 15000 });
  const users = {};
  for (const [key, role] of [['teacherA', 'teacher'], ['teacherB', 'teacher'], ['studentA', 'student'], ['studentB', 'student'], ['admin', 'admin']]) {
    users[key] = { _id: new mongoose.Types.ObjectId(), name: key, email: `${key.toLowerCase()}@example.test`, role, status: 'active' };
  }
  await User.collection.insertMany(Object.values(users));
  const classes = {};
  const quizzes = {};
  const submissions = {};
  for (const key of ['A', 'B']) {
    classes[key] = await Class.create({ name: `Lớp ${key}`, subject: 'Toán', teacher: users[`teacher${key}`]._id,
      students: [users.studentA._id, users.studentB._id], status: 'active' });
    quizzes[key] = await Quiz.create({ title: `Quiz ${key}`, class: classes[key]._id, teacher: users[`teacher${key}`]._id,
      questions: [{ type: 'essay', question: 'Giải thích', points: 5 }], totalPoints: 5 });
    submissions[key] = await QuizSubmission.create({ quiz: quizzes[key]._id, class: classes[key]._id, student: users.studentA._id,
      answers: [{ questionId: quizzes[key].questions[0]._id, answer: 'Trả lời', pointsEarned: 0 }], maxScore: 5, status: 'submitted' });
  }
  const app = express();
  app.use(express.json());
  app.use('/api/quizzes', require('../routes/quizzes'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (actor, route, body) => {
    const token = jwt.sign({ userId: String(users[actor]._id), role: 'admin' }, process.env.JWT_SECRET);
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const gradeRoute = (quiz, submission) => `/api/quizzes/${quiz._id}/submission/${submission._id}/grade`;
  await t.test('MongoDB: ghép quiz/bài nộp chéo hoặc đổi giáo viên không được sửa điểm', async () => {
    const before = await QuizSubmission.findById(submissions.B._id).lean();
    assert.equal((await request('teacherA', gradeRoute(quizzes.A, submissions.B), { questionIndex: 0, score: 5 })).status, 404);
    assert.equal((await request('teacherA', gradeRoute(quizzes.B, submissions.B), { questionIndex: 0, score: 5 })).status, 403);
    assert.equal((await request('studentA', gradeRoute(quizzes.B, submissions.B), { questionIndex: 0, score: 5 })).status, 403);
    assert.deepEqual(await QuizSubmission.findById(submissions.B._id).lean(), before);
  });
  await t.test('MongoDB: giáo viên/admin chấm đúng, điểm sai không ghi và tổng được tính lại', async () => {
    const route = gradeRoute(quizzes.A, submissions.A);
    assert.equal((await request('teacherA', route, { questionIndex: 0, score: 6 })).status, 400);
    assert.equal((await QuizSubmission.findById(submissions.A._id)).totalScore, 0);
    assert.equal((await request('teacherA', route, { questionIndex: 0, score: 3, feedback: 'Đã chấm' })).status, 200);
    let saved = await QuizSubmission.findById(submissions.A._id);
    assert.equal(saved.totalScore, 3);
    assert.equal(saved.percentage, 60);
    assert.equal(saved.feedback, 'Đã chấm');
    assert.equal((await request('admin', route, { questionIndex: 0, score: 5 })).status, 200);
    saved = await QuizSubmission.findById(submissions.A._id);
    assert.equal(saved.totalScore, 5);
    assert.equal(saved.percentage, 100);
  });
});
