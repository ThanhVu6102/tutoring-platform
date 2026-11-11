const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');

test('class filters and pagination integration tests on a real MongoDB replica set', { timeout: 120000 }, async (t) => {
  assert.ok(process.env.CLASS_FILTERS_TEST_MONGODB_URI, 'Set CLASS_FILTERS_TEST_MONGODB_URI to an isolated test replica set');
  const dbName = `class_filters_test_${crypto.randomBytes(12).toString('hex')}`;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  let server;

  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      if (mongoose.connection.name === dbName) {
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
      if (previousSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = previousSecret;
      }
    }
  });

  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.CLASS_FILTERS_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 15000, monitorCommands: true });

  // Chỉ kiểm tra trên replica set riêng, không đọc cấu hình hoặc dữ liệu ứng dụng.
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.ok(hello.setName, 'MongoDB connection must be a replica set');

  await Promise.all([User.init(), Class.init()]);

  // Email giả được lưu chuẩn hóa như luồng đăng ký thật; chữ hoa chỉ nằm ở query.
  const adminId = new mongoose.Types.ObjectId();
  const teacher1Id = new mongoose.Types.ObjectId();
  const teacher2Id = new mongoose.Types.ObjectId();
  const student1Id = new mongoose.Types.ObjectId();
  const student2Id = new mongoose.Types.ObjectId();

  const users = [
    { _id: adminId, name: 'Admin User', email: 'admin@example.test', role: 'admin', status: 'active' },
    { _id: teacher1Id, name: 'Teacher One', email: 'teacher1@example.test', role: 'teacher', status: 'active' },
    { _id: teacher2Id, name: 'Teacher Two', email: 'teacher2@example.test', role: 'teacher', status: 'active' },
    { _id: student1Id, name: 'Student One', email: 'student1@example.test', role: 'student', status: 'active' },
    { _id: student2Id, name: 'Student Two', email: 'student2@example.test', role: 'student', status: 'active' },
  ];
  await User.collection.insertMany(users);

  // Dữ liệu vượt một trang, có tên/thời gian trùng để kiểm tra khóa phụ _id.
  const baseTime = new Date('2026-01-01T00:00:00.000Z');
  const classesToInsert = [];

  for (let i = 1; i <= 25; i++) {
    classesToInsert.push({
      name: i <= 5 ? 'Math Alpha' : i <= 10 ? 'Physics Beta' : 'General Class',
      description: i === 1 ? 'Algebra & calculus with (special) [chars].' : i === 2 ? 'Linear algebra basic.' : `Description for class ${i}`,
      subject: i <= 10 ? 'Mathematics' : 'Science',
      grade: i <= 12 ? 'Grade 10' : 'Grade 11',
      teacher: i % 2 === 0 ? teacher1Id : teacher2Id,
      status: i === 25 ? 'inactive' : 'active',
      capacity: 30,
      students: i <= 15 ? [student1Id] : [student2Id],
      joinCode: `CODE${i.toString().padStart(4, '0')}`,
      createdAt: new Date(baseTime.getTime() + (i * 1000)),
      updatedAt: new Date(baseTime.getTime() + (i * 1000)),
    });
  }

  // Hai lớp cùng tên và thời điểm buộc sort dùng thêm _id để ổn định.
  const tieTime = new Date('2026-02-01T00:00:00.000Z');
  classesToInsert.push(
    {
      name: 'Tie Class',
      description: 'First tie class',
      subject: 'History',
      grade: 'Grade 12',
      teacher: teacher1Id,
      status: 'active',
      capacity: 30,
      students: [student1Id],
      joinCode: 'TIE0001',
      createdAt: tieTime,
      updatedAt: tieTime,
    },
    {
      name: 'Tie Class',
      description: 'Second tie class',
      subject: 'History',
      grade: 'Grade 12',
      teacher: teacher1Id,
      status: 'active',
      capacity: 30,
      students: [student1Id],
      joinCode: 'TIE0002',
      createdAt: tieTime,
      updatedAt: tieTime,
    }
  );

  classesToInsert.forEach((cls) => { cls._id = new mongoose.Types.ObjectId(); });
  // Một hồ sơ lịch sử active và một lớp inactive không khớp q phát hiện lỗi ghi đè $or.
  classesToInsert[15].lockNotice = { status: 'pending' };
  classesToInsert[14].status = 'inactive';
  await Class.collection.insertMany(classesToInsert);

  // Dùng router thật nhưng không import server.js hay bootstrap tài khoản admin.
  const app = express();
  app.use(express.json());
  app.use('/api/classes', require('../routes/classes'));

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  const request = async (path, actor = { userId: String(adminId), role: 'admin' }) => {
    const token = jwt.sign({ userId: actor.userId, role: actor.role }, process.env.JWT_SECRET);
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.json() };
  };

  const ids = (rows) => rows.map((row) => String(row._id));
  const order = (rows, sort = 'newest') => [...rows].sort((a, b) => {
    const direction = ['newest', 'name_desc'].includes(sort) ? -1 : 1;
    const primary = sort.startsWith('name_')
      ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      : a.createdAt.getTime() - b.createdAt.getTime();
    return direction * (primary || (String(a._id) < String(b._id) ? -1 : 1));
  });
  const expectRows = async (query, expected, actor, sort = 'newest') => {
    const res = await request(`/classes?limit=100&${query}`, actor);
    assert.equal(res.status, 200);
    assert.equal(res.body.total, expected.length);
    assert.deepEqual(ids(res.body.data), ids(order(expected, sort)));
    return res.body;
  };

  await t.test('GET /api/classes missing token returns 401', async () => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/classes`);
    assert.equal(res.status, 401);
  });

  await t.test('Admin GET /api/classes q parameter (name+description), escaped literal regex, subject/grade/status', async () => {
    await expectRows('q=Math', classesToInsert.slice(0, 5));
    await expectRows('q=algebra', classesToInsert.slice(0, 2));
    for (const literal of ['(special)', '[chars]']) {
      await expectRows(`q=${encodeURIComponent(literal)}`, [classesToInsert[0]]);
    }
    await expectRows('subject=Mathematics', classesToInsert.slice(0, 10));
    await expectRows('grade=Grade%2010', classesToInsert.slice(0, 12));
    await expectRows('status=inactive', [classesToInsert[14], classesToInsert[24]]);
    await expectRows(`q=Math&subject=Mathematics&grade=Grade%2010&status=active&teacher=${teacher1Id}`,
      [classesToInsert[1], classesToInsert[3]]);
  });

  await t.test('Admin teacher ID and email filter (case normalization)', async () => {
    await expectRows(`teacher=${teacher1Id}`, classesToInsert.filter((c) => c.teacher.equals(teacher1Id)));
    await expectRows('teacher=TEACHER2@EXAMPLE.TEST', classesToInsert.filter((c) => c.teacher.equals(teacher2Id)));
    await expectRows('teacher=missing@example.test', []);
  });

  await t.test('Valid sorts (newest, oldest, name_asc, name_desc) and invalid sort 400', async () => {
    for (const sort of ['newest', 'oldest', 'name_asc', 'name_desc']) {
      await expectRows(`sort=${sort}`, classesToInsert, undefined, sort);
    }

    // Sort không nằm trong allowlist phải bị từ chối.
    const resInvalid = await request('/classes?sort=invalid_sort');
    assert.equal(resInvalid.status, 400);

    for (const sort of ['newest', 'oldest', 'name_asc', 'name_desc']) {
      await expectRows(`sort=${sort}&q=Tie%20Class`, classesToInsert.slice(25), undefined, sort);
    }
  });

  await t.test('Pagination, exact total, summary filter alignment and empty result', async () => {
    const resSummary = await request('/classes?summary=true&subject=Mathematics');
    assert.equal(resSummary.status, 200);
    assert.equal(resSummary.body.total, 10);
    assert.deepEqual(resSummary.body.summary, { total: 10, active: 10, inactive: 0 });
    const inactive = await request('/classes?summary=true&status=inactive&q=General');
    assert.deepEqual(inactive.body.summary, { total: 2, active: 0, inactive: 2 });

    // Trang đầu/cuối không trùng hoặc thiếu bản ghi; total luôn tính trên toàn bộ filter.
    const collected = [];
    for (let page = 1; page <= 6; page++) {
      const res = await request(`/classes?page=${page}&limit=5&sort=oldest`);
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 27);
      assert.equal(res.body.totalPages, 6);
      assert.equal(res.body.page, page);
      collected.push(...res.body.data);
    }
    assert.deepEqual(ids(collected), ids(order(classesToInsert, 'oldest')));
    const beyond = await request('/classes?page=7&limit=5');
    assert.equal(beyond.body.total, 27);
    assert.deepEqual(beyond.body.data, []);

    // Không nhầm danh sách rỗng với lỗi request hoặc tổng của trang.
    const resEmpty = await request('/classes?q=NonExistentClass123456');
    assert.equal(resEmpty.status, 200);
    assert.equal(resEmpty.body.total, 0);
    assert.deepEqual(resEmpty.body.data, []);
  });

  await t.test('Combine history/view with q to verify search not overwritten', async () => {
    await expectRows('view=history&q=General', [classesToInsert[14], classesToInsert[15], classesToInsert[24]]);
    await expectRows('view=history&q=Math', []);
    await expectRows('view=history&q=General&status=active', [classesToInsert[15]]);
  });

  await t.test('Contains summary uses one grouped count and preserves exact totals beyond the last page', async () => {
    const commands = [];
    const client = mongoose.connection.getClient();
    const capture = (event) => {
      if (event.databaseName === dbName && event.command.aggregate === Class.collection.name) commands.push(event.command);
    };
    client.on('commandStarted', capture);
    let response;
    try { response = await request('/classes?q=General&summary=true&page=9&limit=5'); }
    finally { client.off('commandStarted', capture); }
    assert.equal(response.status, 200);
    assert.equal(response.body.total, 15);
    assert.equal(response.body.totalPages, 3);
    assert.deepEqual(response.body.data, []);
    assert.deepEqual(response.body.summary, { total: 15, active: 13, inactive: 2 });
    // Một query trang và một query tổng chung, không còn ba count độc lập.
    assert.equal(commands.length, 2);
    assert.equal(commands.filter((command) => command.pipeline.some((stage) => stage.$group)).length, 1);
    const empty = await request('/classes?q=no-match&summary=true');
    assert.deepEqual(empty.body.summary, { total: 0, active: 0, inactive: 0 });
    assert.deepEqual(empty.body.data, []);
  });

  await t.test('Role tests: student/teacher never widen class scopes via teacher/status/admin query, students cant see inactive', async () => {
    // So sánh ID từ fixture, không truy cập students vốn bị loại khỏi projection.
    for (const studentId of [student1Id, student2Id]) {
      const body = await expectRows(`status=inactive&teacher=${teacher2Id}&q=not-found&view=history&summary=true`,
        classesToInsert.filter((c) => c.status === 'active' && c.students.some((id) => id.equals(studentId))),
        { userId: String(studentId), role: 'admin' });
      assert.equal(body.summary, undefined);
      assert.ok(body.data.every((c) => c.students === undefined && c.joinCode === undefined && c.joinRequests === undefined));
    }
    // Role JWT cố ý giả admin: quyền thật phải lấy từ record DB của giáo viên.
    const body = await expectRows(`teacher=${teacher2Id}&q=not-found&summary=true`,
      classesToInsert.filter((c) => c.teacher.equals(teacher1Id)),
      { userId: String(teacher1Id), role: 'admin' });
    assert.equal(body.summary, undefined);
  });

  await t.test('Grouped summary does not combine large page thumbnails into one 16 MiB BSON document', async () => {
    // Payload trang vượt 16 MiB nhưng từng lớp vẫn hợp lệ: query trang và count
    // độc lập, không gom thumbnail vào một document facet lớn.
    const large = Array.from({ length: 10 }, (_, index) => ({ ...classesToInsert[0],
      _id: new mongoose.Types.ObjectId(), name: `Large payload ${index}`, joinCode: `BIG${index}`,
      thumbnail: 'x'.repeat(2 * 1024 * 1024),
    }));
    try {
      await Class.collection.insertMany(large);
      const res = await request('/classes?q=Large%20payload&summary=true&limit=10');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 10);
      assert.deepEqual(res.body.summary, { total: 10, active: 10, inactive: 0 });
      assert.equal(res.body.data.length, 10);
      assert.ok(res.body.data.every((cls) => cls.thumbnail.length === 2 * 1024 * 1024));
    } finally {
      await Class.collection.deleteMany({ _id: { $in: large.map((cls) => cls._id) } });
    }
  });
});
