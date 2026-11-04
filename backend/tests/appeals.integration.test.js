const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const { confirmStudentWarning, finalizeExpiredStudentWarnings } = require('../utils/studentWarnings');

// Chạy riêng với URI test tường minh. Không đọc .env/MONGODB_URI hoặc import server
// (server sẽ bootstrap admin). Mỗi lần chạy chỉ tạo/xóa database test có tên ngẫu nhiên.
test('appeals on a real MongoDB replica set', { timeout: 120000 }, async (t) => {
  const uri = process.env.APPEALS_TEST_MONGODB_URI;
  assert.ok(uri, 'Set APPEALS_TEST_MONGODB_URI to an isolated MongoDB replica set');
  const database = `appeals_test_${crypto.randomUUID().replaceAll('-', '')}`;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: database, serverSelectionTimeoutMS: 15000 });
  let server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  });
  assert.ok((await mongoose.connection.db.admin().command({ hello: 1 })).setName, 'Integration tests need a replica set');
  await Promise.all([User.init(), Class.init(), StudentWarning.init()]);
  const app = express();
  app.use(express.json());
  app.use('/api/student-warnings', require('../routes/studentWarnings'));
  app.use('/api/classes', require('../routes/classes'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  const notice = { reasonCode: 'spam', policyLevel: '1', details: 'Bằng chứng trong test' };
  const warningPath = (warning) => `/student-warnings/${warning._id}`;
  const classPath = (cls) => `/classes/${cls._id}`;
  const contains = (items, id) => items.some((item) => String(item) === String(id));
  async function request(user, method, path, body) {
    const token = jwt.sign({ userId: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, body: await result.json() };
  }
  async function user(role) {
    const name = crypto.randomUUID();
    return User.create({ name, role, status: 'active', email: `${name}@example.test`, password: 'test-only-unused-password' });
  }
  async function fixture() {
    const [admin, admin2, teacher, student] = await Promise.all(['admin', 'admin', 'teacher', 'student'].map(user));
    const f = { admin, admin2, teacher, student };
    f.cls = await extraClass(f);
    return f;
  }
  async function extraClass(f) {
    const cls = await Class.create({ name: 'Lớp kiểm thử', subject: 'Toán', teacher: f.teacher._id,
      students: [f.student._id], joinCode: crypto.randomBytes(8).toString('hex') });
    await User.updateOne({ _id: f.student._id }, { $addToSet: { enrolledClasses: cls._id } });
    return cls;
  }
  async function warning(f, { cls = f.cls, status = 'pending', deadline = new Date(Date.now() + 86400000) } = {}) {
    return StudentWarning.create({ ...notice, student: f.student._id, class: cls._id, issuedBy: f.admin._id,
      status, appealDeadline: deadline, violationCounted: status === 'confirmed',
      ...(status === 'appealed' ? { appealedBy: f.student._id, appealedAt: new Date(), appealMessage: 'Xin xem xét' } : {}) });
  }
  async function twoConfirmed(f, cls = f.cls) {
    await Promise.all([warning(f, { cls, status: 'confirmed' }), warning(f, { cls, status: 'confirmed' })]);
  }

  await t.test('warning issue/appeal/dismiss works through HTTP and keeps the existing response contract', async () => {
    const f = await fixture();
    const issued = await request(f.admin, 'POST', `/student-warnings/${f.student._id}`, {
      ...notice, classId: String(f.cls._id), issuedBy: String(f.teacher._id),
    });
    assert.equal(issued.status, 201);
    const record = issued.body.warning;
    assert.equal(record.issuedBy, String(f.admin._id));
    assert.equal(new Date(record.appealDeadline) - new Date(record.issuedAt), 7 * 86400000);
    const submitted = await request(f.student, 'POST', `${warningPath(record)}/appeal`, {
      message: '  Đề nghị xem lại  ', appealedBy: String(f.teacher._id),
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.warning.status, 'appealed');
    assert.equal(submitted.body.warning.appealMessage, 'Đề nghị xem lại');
    assert.equal(submitted.body.warning.appealedBy, String(f.student._id));
    const reviewed = await request(f.admin2, 'PATCH', `${warningPath(record)}/review`, { decision: 'dismiss', response: 'Đã xem xét' });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.warning.status, 'dismissed');
    assert.equal(reviewed.body.warning.reviewedBy, String(f.admin2._id));
    assert.equal(reviewed.body.warning.student._id, String(f.student._id));
    assert.equal(reviewed.body.warning.class._id, String(f.cls._id));
    const mine = await request(f.student, 'GET', '/student-warnings/mine?studentId=untrusted');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.length, 1);
    assert.equal(mine.body[0].issuedBy.email, undefined);
    assert.equal(mine.body[0].adminResponse, 'Đã xem xét');
    assert.equal((await User.findById(f.student._id)).classRemovalIncidents, 0);
  });

  await t.test('student ownership, missing records, expired deadlines and manual pending review are enforced', async () => {
    const f = await fixture();
    const other = await user('student');
    const own = await warning(f);
    const expired = await warning(f, { deadline: new Date(0) });
    assert.equal((await request(other, 'POST', `${warningPath(own)}/appeal`, { message: 'Giả mạo', student: String(f.student._id) })).status, 404);
    const otherList = await request(other, 'GET', `/student-warnings/mine?student=${f.student._id}`);
    assert.deepEqual(otherList.body, []);
    assert.equal((await request(f.student, 'POST', `${warningPath(expired)}/appeal`, { message: 'Quá hạn' })).status, 409);
    assert.equal((await request(f.admin, 'PATCH', `${warningPath(own)}/review`, { decision: 'confirm' })).status, 409);
    const missing = new mongoose.Types.ObjectId();
    assert.equal((await request(f.student, 'POST', `/student-warnings/${missing}/appeal`, { message: 'Không tồn tại' })).status, 404);
    assert.equal((await request(f.admin, 'PATCH', `/student-warnings/${missing}/review`, { decision: 'dismiss' })).status, 404);
    assert.equal((await request(f.teacher, 'POST', `/classes/${missing}/lock-appeal`, { message: 'Không tồn tại' })).status, 404);
  });

  await t.test('concurrent warning submissions retain only one original appeal', async () => {
    const f = await fixture();
    const record = await warning(f);
    const results = await Promise.all(['Nội dung A', 'Nội dung B'].map((message) =>
      request(f.student, 'POST', `${warningPath(record)}/appeal`, { message })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const saved = await StudentWarning.findById(record._id);
    assert.equal(saved.appealMessage, results.find((result) => result.status === 200).body.warning.appealMessage);
    assert.equal(saved.violationCounted, false);
  });

  await t.test('concurrent confirm/dismiss cannot overwrite the winner or leave losing sanctions', async () => {
    const f = await fixture();
    await twoConfirmed(f);
    const record = await warning(f, { status: 'appealed' });
    const results = await Promise.all([
      request(f.admin, 'PATCH', `${warningPath(record)}/review`, { decision: 'confirm', response: 'Xác nhận' }),
      request(f.admin2, 'PATCH', `${warningPath(record)}/review`, { decision: 'dismiss', response: 'Chấp thuận' }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const saved = await StudentWarning.findById(record._id);
    const winner = results.find((result) => result.status === 200).body.warning;
    assert.equal(saved.status, winner.status);
    assert.equal(String(saved.reviewedBy), winner.reviewedBy);
    const confirmed = saved.status === 'confirmed';
    assert.equal(saved.violationCounted, confirmed);
    assert.equal(saved.classRemovalApplied, confirmed);
    assert.equal((await User.findById(f.student._id)).classRemovalIncidents, confirmed ? 1 : 0);
    assert.equal(contains((await Class.findById(f.cls._id)).students, f.student._id), !confirmed);
  });

  await t.test('concurrent duplicate confirmations apply a removal exactly once', async () => {
    const f = await fixture();
    await twoConfirmed(f);
    const record = await warning(f, { status: 'appealed' });
    const results = await Promise.all([f.admin, f.admin2].map((actor) =>
      request(actor, 'PATCH', `${warningPath(record)}/review`, { decision: 'confirm' })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal((await User.findById(f.student._id)).classRemovalIncidents, 1);
    assert.equal((await StudentWarning.findById(record._id)).classWarningCount, 3);
  });

  await t.test('different concurrent warnings serialize counts and do not count an already removed student twice', async () => {
    const f = await fixture();
    await twoConfirmed(f);
    const records = await Promise.all([warning(f, { status: 'appealed' }), warning(f, { status: 'appealed' })]);
    const results = await Promise.all(records.map((record) =>
      request(f.admin, 'PATCH', `${warningPath(record)}/review`, { decision: 'confirm' })));
    assert.deepEqual(results.map((result) => result.status), [200, 200]);
    const saved = await StudentWarning.find({ _id: { $in: records.map((record) => record._id) } });
    assert.deepEqual(saved.map((record) => record.classWarningCount).sort(), [3, 4]);
    assert.equal(saved.filter((record) => record.classRemovalApplied).length, 1);
    const student = await User.findById(f.student._id);
    assert.equal(student.classRemovalIncidents, 1);
    assert.equal(student.disciplinarySanctions, 0);
    assert.ok(!contains(student.enrolledClasses, f.cls._id));
  });

  await t.test('distinct classes escalate through 7 days, 30 days and permanent ban; restricted tokens remain blocked', async () => {
    const f = await fixture();
    for (let incident = 1; incident <= 4; incident++) {
      const cls = incident === 1 ? f.cls : await extraClass(f);
      await twoConfirmed(f, cls);
      const record = await warning(f, { cls, status: 'appealed' });
      const before = Date.now();
      const result = await request(f.admin, 'PATCH', `${warningPath(record)}/review`, { decision: 'confirm' });
      assert.equal(result.status, 200);
      const student = await User.findById(f.student._id);
      assert.equal(student.classRemovalIncidents, incident);
      assert.equal(student.disciplinarySanctions, Math.max(0, incident - 1));
      assert.equal(result.body.warning.accountSanction,
        ['none', 'suspension_7_days', 'suspension_1_month', 'permanent_ban'][incident - 1]);
      if (incident === 2 || incident === 3) {
        const duration = (incident === 2 ? 7 : 30) * 86400000;
        assert.ok(student.suspendedUntil >= new Date(before + duration));
        assert.ok(student.suspendedUntil <= new Date(Date.now() + duration));
        assert.equal((await request(f.student, 'GET', '/student-warnings/mine')).status, 423);
      }
      if (incident === 4) {
        assert.equal(student.permanentlyBanned, true);
        assert.equal(student.suspendedUntil, null);
        assert.equal((await request(f.student, 'GET', '/student-warnings/mine')).status, 403);
      }
    }
  });

  await t.test('re-enrolling in the same class does not invent a different-class disciplinary incident', async () => {
    const f = await fixture();
    await twoConfirmed(f);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) {
        await Class.updateOne({ _id: f.cls._id }, { $addToSet: { students: f.student._id } });
        await User.updateOne({ _id: f.student._id }, { $addToSet: { enrolledClasses: f.cls._id } });
      }
      const record = await warning(f, { status: 'appealed' });
      assert.equal((await request(f.admin, 'PATCH', `${warningPath(record)}/review`, { decision: 'confirm' })).status, 200);
      assert.equal((await StudentWarning.findById(record._id)).classRemovalApplied, true);
      const student = await User.findById(f.student._id);
      assert.equal(student.classRemovalIncidents, 1);
      assert.equal(student.disciplinarySanctions, 0);
    }
  });

  await t.test('expiry processing is repeat-safe and never confirms an appeal from an outdated pending snapshot', async () => {
    const f = await fixture();
    const expired = await warning(f, { deadline: new Date(0) });
    const appealed = await warning(f, { status: 'appealed', deadline: new Date(0) });
    assert.equal(await confirmStudentWarning(appealed._id, 'Stale expiry worker', { expiredBefore: new Date() }), null);
    await Promise.all([finalizeExpiredStudentWarnings(String(f.student._id)), finalizeExpiredStudentWarnings(String(f.student._id))]);
    const saved = await StudentWarning.findById(expired._id);
    assert.equal(saved.status, 'confirmed');
    assert.equal(saved.classWarningCount, 1);
    assert.equal(saved.reviewedBy, null);
    assert.equal((await StudentWarning.findById(appealed._id)).status, 'appealed');
    assert.equal(await StudentWarning.countDocuments({ student: f.student._id, violationCounted: true }), 1);
  });

  await t.test('a late persistence failure rolls back warning, class roster, user roster and counters', async (t) => {
    const f = await fixture();
    await twoConfirmed(f);
    const record = await warning(f, { status: 'appealed' });
    const original = StudentWarning.prototype.save;
    const stub = t.mock.method(StudentWarning.prototype, 'save', function(...args) {
      if (this._id.equals(record._id)) throw new Error('Injected persistence failure after roster updates');
      return original.apply(this, args);
    });
    t.mock.method(console, 'error', () => {});
    assert.equal((await request(f.admin, 'PATCH', `${warningPath(record)}/review`, { decision: 'confirm' })).status, 500);
    const saved = await StudentWarning.findById(record._id);
    assert.equal(saved.status, 'appealed');
    assert.equal(saved.violationCounted, false);
    assert.equal(saved.classRemovalApplied, false);
    assert.equal(saved.reviewedBy, undefined);
    assert.ok(contains((await Class.findById(f.cls._id)).students, f.student._id));
    const student = await User.findById(f.student._id).select('+warningRevision');
    assert.ok(contains(student.enrolledClasses, f.cls._id));
    assert.equal(student.classRemovalIncidents, 0);
    assert.equal(student.warningRevision, 0);
    stub.mock.restore();
    assert.equal((await request(f.admin, 'PATCH', `${warningPath(record)}/review`, { decision: 'confirm' })).status, 200);
    assert.equal((await User.findById(f.student._id)).classRemovalIncidents, 1);
  });

  await t.test('class notice/appeal/lock/reopen stores actors and preserves the original decision exactly once', async () => {
    const f = await fixture();
    // Tương thích với document cũ chưa có phiên bản nội bộ.
    await Class.collection.updateOne({ _id: f.cls._id }, { $unset: { lockRevision: '' } });
    const issued = await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-notice`, notice);
    assert.equal(issued.status, 202);
    assert.equal(issued.body.class.lockRevision, undefined);
    assert.equal(issued.body.class.lockNotice.issuedBy, String(f.admin._id));
    assert.equal(new Date(issued.body.class.lockNotice.appealDeadline) - new Date(issued.body.class.lockNotice.issuedAt), 86400000);
    assert.equal((await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-review`, { decision: 'lock' })).status, 409);
    assert.equal((await request(f.teacher, 'POST', `${classPath(f.cls)}/lock-appeal`, { message: 'Đề nghị xem xét' })).status, 200);
    const locked = await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-review`, { decision: 'lock', response: 'Giữ quyết định khóa' });
    assert.equal(locked.status, 200);
    assert.equal(locked.body.class.status, 'inactive');
    const results = await Promise.all([f.admin, f.admin2].map((actor) =>
      request(actor, 'PATCH', `${classPath(f.cls)}/status`, { status: 'active' })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const saved = await Class.findById(f.cls._id);
    assert.equal(saved.status, 'active');
    assert.equal(saved.lockNotice.status, 'none');
    assert.equal(saved.lockNoticeHistory.length, 1);
    const history = saved.lockNoticeHistory[0];
    assert.equal(history.status, 'locked');
    assert.equal(String(history.reviewedBy), String(f.admin._id));
    assert.equal(history.adminResponse, 'Giữ quyết định khóa');
    assert.equal(history.resolvedAt.toISOString(), locked.body.class.lockNotice.resolvedAt);
    assert.equal(String(history.appealedBy), String(f.teacher._id));
    assert.ok(history.reopenedBy);
    assert.ok(history.reopenedAt >= history.resolvedAt);
  });

  await t.test('concurrent class notice creation, appeals and opposing reviews each have one winner', async () => {
    const f = await fixture();
    const issueResults = await Promise.all([f.admin, f.admin2].map((actor) =>
      request(actor, 'PATCH', `${classPath(f.cls)}/lock-notice`, notice)));
    assert.deepEqual(issueResults.map((result) => result.status).sort(), [202, 409]);
    const appealResults = await Promise.all(['Nội dung A', 'Nội dung B'].map((message) =>
      request(f.teacher, 'POST', `${classPath(f.cls)}/lock-appeal`, { message })));
    assert.deepEqual(appealResults.map((result) => result.status).sort(), [200, 409]);
    const results = await Promise.all([
      request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-review`, { decision: 'lock' }),
      request(f.admin2, 'PATCH', `${classPath(f.cls)}/lock-review`, { decision: 'dismiss' }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const saved = await Class.findById(f.cls._id);
    if (saved.status === 'inactive') {
      assert.equal(saved.lockNotice.status, 'locked');
      assert.equal(String(saved.lockNotice.reviewedBy), String(f.admin._id));
      assert.equal(saved.lockNoticeHistory.length, 0);
    } else {
      assert.equal(saved.lockNotice.status, 'none');
      assert.equal(saved.lockNoticeHistory.length, 1);
      assert.equal(saved.lockNoticeHistory[0].status, 'dismissed');
      assert.equal(String(saved.lockNoticeHistory[0].reviewedBy), String(f.admin2._id));
    }
  });

  await t.test('class dismissal archives appeal; expired unappealed notices can be reviewed but not appealed', async () => {
    const f = await fixture();
    await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-notice`, notice);
    await request(f.teacher, 'POST', `${classPath(f.cls)}/lock-appeal`, { message: 'Nội dung cần lưu' });
    const dismissed = await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-review`, { decision: 'dismiss', response: 'Đồng ý' });
    assert.equal(dismissed.status, 200);
    assert.equal(dismissed.body.class.lockNotice.status, 'none');
    assert.equal(dismissed.body.class.lockNoticeHistory[0].appealMessage, 'Nội dung cần lưu');
    assert.equal(dismissed.body.class.lockNoticeHistory[0].adminResponse, 'Đồng ý');
    assert.equal((await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-review`, { decision: 'dismiss' })).status, 409);
    assert.equal((await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-notice`, notice)).status, 202);
    await Class.updateOne({ _id: f.cls._id }, { $set: { 'lockNotice.appealDeadline': new Date(0) } });
    assert.equal((await request(f.teacher, 'POST', `${classPath(f.cls)}/lock-appeal`, { message: 'Quá hạn' })).status, 409);
    assert.equal((await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-review`, { decision: 'lock' })).status, 200);
    assert.equal((await Class.findById(f.cls._id)).lockNoticeHistory.length, 1);
  });

  await t.test('class detail and paginated lists hide teacher appeals from students and unrelated teachers', async () => {
    const f = await fixture();
    const outsider = await user('teacher');
    await request(f.admin, 'PATCH', `${classPath(f.cls)}/lock-notice`, notice);
    await request(f.teacher, 'POST', `${classPath(f.cls)}/lock-appeal`, { message: 'PRIVATE_APPEAL_TEXT' });
    await Class.updateOne({ _id: f.cls._id }, { $push: { lockNoticeHistory: {
      status: 'dismissed', appealMessage: 'PRIVATE_HISTORY_TEXT', adminResponse: 'PRIVATE_RESPONSE',
    } } });
    for (const path of [classPath(f.cls), '/classes?view=history&role=admin']) {
      const result = await request(f.student, 'GET', path);
      assert.equal(result.status, 200);
      const cls = result.body.data ? result.body.data.find((row) => row._id === String(f.cls._id)) : result.body;
      assert.deepEqual(cls.lockNotice, { status: 'appealed' });
      assert.equal(cls.lockNoticeHistory, undefined);
      assert.equal(cls.lockRevision, undefined);
      assert.ok(!JSON.stringify(result.body).includes('PRIVATE_'));
    }
    for (const actor of [f.teacher, f.admin]) {
      const result = await request(actor, 'GET', classPath(f.cls));
      assert.equal(result.status, 200);
      assert.equal(result.body.lockNotice.appealMessage, 'PRIVATE_APPEAL_TEXT');
      assert.equal(result.body.lockNoticeHistory[0].adminResponse, 'PRIVATE_RESPONSE');
    }
    assert.equal((await request(outsider, 'GET', classPath(f.cls))).status, 403);
    assert.equal((await request(outsider, 'POST', `${classPath(f.cls)}/lock-appeal`, { message: 'Giả mạo' })).status, 403);
    assert.deepEqual((await request(outsider, 'GET', '/classes?view=history')).body.data, []);
  });
});
