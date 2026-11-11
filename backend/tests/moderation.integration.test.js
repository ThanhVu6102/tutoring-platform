const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const { fixtures } = require('../scripts/lib/performance-lab');

// URI test riêng, không đọc .env hoặc bootstrap admin; chỉ drop DB ngẫu nhiên do test tạo.
test('moderation API parity and bounded pages on a real MongoDB replica set', { timeout: 120000 }, async (t) => {
  assert.ok(process.env.MODERATION_TEST_MONGODB_URI, 'Set MODERATION_TEST_MONGODB_URI to an isolated test replica set');
  const dbName = `moderation_test_${crypto.randomBytes(12).toString('hex')}`;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  let server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    try {
      if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
      if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    }
  });
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MODERATION_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 15000 });
  assert.ok((await mongoose.connection.db.admin().command({ hello: 1 })).setName);
  await Promise.all([User.init(), Class.init(), StudentWarning.init()]);
  const f = fixtures(mongoose, { users: 150, classes: 30, warnings: 90, items: 1 });
  // Thêm trường hợp biên để so sánh với đúng điều kiện client cũ.
  f.data.User[20].deletedAt = new Date();
  f.data.User[21].role = 'teacher';
  f.data.User[149].classRemovalIncidents = 1;
  f.data.User[148].disciplinarySanctions = 1;
  f.data.User[147].permanentlyBanned = true;
  f.data.User[146].suspendedUntil = new Date(Date.now() + 86400000);
  f.data.Class[1].lockNoticeHistory = [{ status: 'dismissed', appealMessage: 'Private history' }];
  for (const [model, name] of [[User, 'User'], [Class, 'Class'], [StudentWarning, 'StudentWarning']]) {
    await model.collection.insertMany(f.data[name]);
  }
  const app = express();
  app.use(express.json());
  app.use(require('../middleware/apiPerformance'));
  app.use('/api/moderation', require('../routes/moderation'));
  app.use('/api/student-warnings', require('../routes/studentWarnings'));
  app.use('/api/classes', require('../routes/classes'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  async function request(path, actor = f.admin) {
    const token = jwt.sign({ userId: String(actor._id), role: 'admin' }, process.env.JWT_SECRET);
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.json() };
  }
  const ids = (values) => values.map((item) => String(item._id)).sort();
  const expectedStudentIds = new Set(f.data.StudentWarning.map((warning) => String(warning.student)));
  const expectedStudents = f.data.User.filter((student) => student.role === 'student' && !student.deletedAt
    && (expectedStudentIds.has(String(student._id)) || student.classRemovalIncidents > 0
      || student.disciplinarySanctions > 0 || student.permanentlyBanned || student.suspendedUntil > new Date()));
  const expectedClasses = f.data.Class.filter((cls) => cls.status === 'inactive' || (cls.lockNotice?.status && cls.lockNotice.status !== 'none'));

  await t.test('summary and each complete paginated group match the old UI semantics, not the first page', async () => {
    const summary = await request('/moderation/summary');
    assert.equal(summary.status, 200);
    assert.deepEqual(summary.body, { totalWarnings: 90, openWarnings: f.data.StudentWarning.filter((w) => ['pending', 'appealed'].includes(w.status)).length,
      violationClasses: expectedClasses.length });
    for (const [section, expected] of [['warnings', f.data.StudentWarning], ['students', expectedStudents], ['classes', expectedClasses]]) {
      const records = [];
      for (let page = 1; ; page++) {
        const result = await request(`/moderation/${section}?page=${page}&limit=7`);
        assert.equal(result.status, 200);
        assert.equal(result.body.total, expected.length);
        assert.equal(result.body.page, page);
        assert.ok(result.body.data.length <= 7);
        records.push(...result.body.data);
        if (page >= result.body.totalPages) break;
      }
      assert.deepEqual(ids(records), ids(expected));
      assert.equal(new Set(ids(records)).size, records.length);
      assert.ok(!JSON.stringify(records).includes('warningMatch'));
      assert.ok(!JSON.stringify(records).includes('password'));
      assert.ok(!JSON.stringify(records).includes('data:image'));
    }
  });

  await t.test('status filters, capped page size, empty pages and role scoping are enforced', async () => {
    const filtered = await request('/moderation/warnings?status=dismissed&limit=1000');
    assert.equal(filtered.body.limit, 100);
    assert.equal(filtered.body.total, f.data.StudentWarning.filter((w) => w.status === 'dismissed').length);
    assert.ok(filtered.body.data.every((w) => w.status === 'dismissed'));
    assert.deepEqual((await request('/moderation/warnings?page=100')).body.data, []);
    assert.equal((await request('/moderation/warnings?status=wrong')).status, 400);
    for (const actor of [f.student, f.teacher]) {
      for (const section of ['summary', 'warnings', 'students', 'classes']) {
        assert.equal((await request(`/moderation/${section}?role=admin`, actor)).status, 403);
      }
    }
  });

  await t.test('legacy contracts remain arrays while new warning payload is paginated and bounded', async () => {
    assert.ok(Array.isArray((await request('/student-warnings')).body));
    assert.ok(Array.isArray((await request('/student-warnings/mine', f.student)).body));
    const result = await request('/moderation/warnings');
    assert.equal(result.body.data.length, 20);
    assert.equal(result.body.total, 90);
    const classes = await request('/classes');
    assert.equal(classes.body.limit, 20);
    assert.equal(classes.body.total, 30);
  });

  await t.test('all read endpoints finalize expired pending warnings using the existing transaction workflow', async () => {
    for (const section of ['summary', 'warnings', 'students', 'classes']) {
      const warning = await StudentWarning.create({ student: f.student._id, class: f.cls._id, issuedBy: f.admin._id,
        reasonCode: 'spam', policyLevel: 1, details: 'Expiry fixture', status: 'pending', appealDeadline: new Date(0) });
      const response = await request(`/moderation/${section}`);
      assert.equal(response.status, 200);
      const saved = await StudentWarning.findById(warning._id);
      assert.equal(saved.status, 'confirmed');
      assert.equal(saved.violationCounted, true);
    }
    // Hai request khởi tạo cùng lúc không được tính cảnh báo đã xử lý lần nữa.
    const results = await Promise.all([request('/moderation/summary'), request('/moderation/warnings')]);
    assert.deepEqual(results.map((result) => result.status), [200, 200]);
    assert.equal(results[0].body.totalWarnings, results[1].body.total);
  });
});
