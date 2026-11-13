const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createLab } = require('./lib/isolated-mongo');

// Chỉ chạy production build với router/DB thật trong lab sở hữu riêng, không nạp .env.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--tools-dir' || !path.isAbsolute(args[1])) {
    throw new Error('Cần --tools-dir trỏ tới thư mục công cụ Playwright tạm');
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(args[1], 'browsers');
  const { chromium } = require(path.join(args[1], 'node_modules/playwright'));
  const build = path.resolve(__dirname, '../../frontend/build');
  assert.ok(fs.existsSync(path.join(build, 'index.html')), 'Cần build frontend trước');
  const resource = await createLab();
  const output = path.resolve(__dirname, '../../docs/local/security', `assignment-ui-${resource.id}`);
  fs.mkdirSync(output, { recursive: true });
  const report = { status: 'running', startedAt: new Date().toISOString(), checks: [],
    environment: { image: resource.image, backend: 'real routers + MongoDB', frontend: 'production build',
      authentication: 'synthetic JWT, not a login test', data: 'synthetic local only', browser: 'Chromium' } };
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  let server;
  let browser;
  try {
    await mongoose.connect(resource.uri, { dbName: resource.database, serverSelectionTimeoutMS: 15000 });
    const User = require('../models/User');
    const Class = require('../models/Class');
    const Assignment = require('../models/Assignment');
    const users = Object.fromEntries([['studentA', 'student', 'Học sinh A'], ['studentB', 'student', 'Học sinh B'],
      ['teacher', 'teacher', 'Giáo viên kiểm thử'], ['admin', 'admin', 'Quản trị kiểm thử']].map(([key, role, name]) => [key,
      { _id: new mongoose.Types.ObjectId(), name, role, status: 'active', email: `assignment-${key.toLowerCase()}@example.test` }]));
    await User.collection.insertMany(Object.values(users));
    const cls = await Class.create({ name: 'Lớp kiểm thử bài tập', subject: 'Toán', teacher: users.teacher._id,
      students: [users.studentA._id, users.studentB._id], status: 'active' });
    const app = express();
    app.use(express.json());
    for (const route of ['classes', 'users', 'assignments', 'studentWarnings', 'videos', 'documents', 'quizzes', 'announcements']) {
      app.use(`/api/${route === 'studentWarnings' ? 'student-warnings' : route}`, require(`../routes/${route}`));
    }
    app.use('/api', (req, res) => res.sendStatus(404));
    app.use(express.static(build));
    app.get('*', (req, res) => res.sendFile(path.join(build, 'index.html')));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    report.environment.browserVersion = browser.version();
    const check = async (name, fn) => {
      await fn();
      report.checks.push({ name, passed: true });
      console.log(`PASS ${name}`);
    };
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const contexts = [];
      const records = {};
      const title = `Bài tập kiểm thử ${viewport.width}`;
      const assignment = await Assignment.create({ title, description: 'Nộp đường dẫn và xem kết quả riêng tư.', class: cls._id,
        teacher: users.teacher._id, totalPoints: 10, dueDate: new Date(Date.now() - 86400000),
        submissions: [{ student: users.studentB._id, fileUrl: 'https://example.test/only-B.pdf', score: 9, feedback: 'Nội dung riêng B' }],
      });
      const detailPath = `/api/assignments/${assignment._id}`;
      const aUrl = `https://example.test/submission-A-${viewport.width}.pdf`;
      const feedbackA = `Nhận xét chính chủ A ${viewport.width}`;
      try {
        for (const key of ['studentA', 'studentB', 'teacher', 'admin']) {
          const actor = users[key];
          const context = await browser.newContext({ viewport });
          contexts.push(context);
          const external = [];
          // Chặn mọi origin ngoài lab trước khi mở trang: không gửi JWT test ra mạng ngoài.
          await context.route('**/*', (route) => {
            const url = new URL(route.request().url());
            if (url.origin === base || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.origin);
            return route.abort();
          });
          const token = jwt.sign({ userId: String(actor._id), role: actor.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
          await context.addInitScript(({ value, role, id }) => {
            localStorage.setItem('token', value);
            localStorage.setItem('userRole', role);
            localStorage.setItem('userId', id);
          }, { value: token, role: actor.role, id: String(actor._id) });
          const page = await context.newPage();
          const errors = [];
          const writes = [];
          page.on('pageerror', (error) => errors.push(error.name));
          page.on('request', (request) => {
            if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith(detailPath)) writes.push(request.postDataJSON());
          });
          const open = async () => {
            await page.goto(`${base}/class/${cls._id}`);
            const listResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/assignments/class/${cls._id}`);
            await page.getByRole('button', { name: 'Bài Tập', exact: true }).click();
            const list = await (await listResponse).json();
            assert.ok(list.data.every((item) => !Object.hasOwn(item, 'submissions')));
            const card = page.locator('.grid .card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
            const detailResponse = page.waitForResponse((response) => new URL(response.url()).pathname === detailPath);
            await card.getByRole('button', { name: actor.role === 'student' ? 'Nộp / xem bài của tôi' : 'Xem và chấm bài', exact: true }).click();
            const response = await detailResponse;
            assert.equal(response.status(), 200);
            const body = await response.json();
            await page.locator('.assignment-workspace').getByRole('heading', { name: title, exact: true }).waitFor();
            return body;
          };
          records[key] = { page, open, external, errors, writes };
        }
        const a = records.studentA;
        const b = records.studentB;
        const teacher = records.teacher;
        const admin = records.admin;
        await check(`${viewport.width}: học sinh A không nhận dữ liệu bài B, nộp URL một lần và giữ bài B`, async () => {
          const beforeB = assignment.submissions[0].toObject();
          const data = await a.open();
          assert.deepEqual(data.submissions, []);
          assert.equal(await a.page.getByText('Nội dung riêng B', { exact: true }).count(), 0);
          const form = a.page.getByRole('form', { name: 'Nộp bài tập', exact: true });
          await form.getByLabel('Đường dẫn bài nộp', { exact: true }).fill(aUrl);
          const response = a.page.waitForResponse((res) => new URL(res.url()).pathname === `${detailPath}/submit` && res.request().method() === 'POST');
          await form.getByRole('button', { name: 'Gửi bài nộp', exact: true }).evaluate((button) => { button.click(); button.click(); });
          assert.equal((await response).status(), 200);
          await a.page.locator('.assignment-workspace a').filter({ hasText: 'Mở bài nộp' }).waitFor();
          assert.equal(a.writes.length, 1);
          assert.deepEqual(a.writes[0], { fileUrl: aUrl });
          const saved = await Assignment.findById(assignment._id);
          const own = saved.submissions.find((item) => item.student.equals(users.studentA._id));
          assert.equal(own.fileUrl, aUrl);
          assert.equal(own.isLate, true);
          assert.deepEqual(saved.submissions.find((item) => item.student.equals(users.studentB._id)).toObject(), beforeB);
        });
        await check(`${viewport.width}: học sinh B chỉ xem file/điểm/nhận xét chính chủ`, async () => {
          const data = await b.open();
          assert.equal(data.submissions.length, 1);
          assert.equal(data.submissions[0].student, String(users.studentB._id));
          assert.equal(JSON.stringify(data).includes(aUrl), false);
          assert.equal(await b.page.locator(`a[href="${aUrl}"]`).count(), 0);
          await b.page.getByText('9 / 10', { exact: false }).waitFor();
        });
        await check(`${viewport.width}: giáo viên chấm điểm 0 một lần, không thay đổi bài B`, async () => {
          const data = await teacher.open();
          assert.equal(data.submissions.length, 2);
          const beforeB = (await Assignment.findById(assignment._id)).submissions.find((item) => item.student.equals(users.studentB._id)).toObject();
          const form = teacher.page.getByRole('form', { name: 'Chấm bài của Học sinh A', exact: true });
          await form.getByLabel('Điểm (0–10)', { exact: true }).fill('0');
          await form.getByLabel('Nhận xét', { exact: true }).fill(feedbackA);
          const response = teacher.page.waitForResponse((res) => new URL(res.url()).pathname === `${detailPath}/grade` && res.request().method() === 'POST');
          await form.getByRole('button', { name: 'Lưu điểm', exact: true }).evaluate((button) => { button.click(); button.click(); });
          assert.equal((await response).status(), 200);
          await teacher.page.getByText(feedbackA, { exact: false }).first().waitFor();
          assert.equal(teacher.writes.length, 1);
          assert.deepEqual(teacher.writes[0], { studentId: String(users.studentA._id), score: 0, feedback: feedbackA });
          const saved = await Assignment.findById(assignment._id);
          assert.equal(saved.submissions.find((item) => item.student.equals(users.studentA._id)).score, 0);
          assert.deepEqual(saved.submissions.find((item) => item.student.equals(users.studentB._id)).toObject(), beforeB);
        });
        await check(`${viewport.width}: A đọc lại kết quả chấm, vẫn không thấy nhận xét B`, async () => {
          const data = await a.open();
          assert.equal(data.submissions.length, 1);
          assert.equal(data.submissions[0].score, 0);
          await a.page.getByText(feedbackA, { exact: false }).first().waitFor();
          assert.equal(await a.page.getByText('Nội dung riêng B', { exact: false }).count(), 0);
        });
        await check(`${viewport.width}: admin xem/chấm B, không sửa kết quả A`, async () => {
          const data = await admin.open();
          assert.equal(data.submissions.length, 2);
          const beforeA = (await Assignment.findById(assignment._id)).submissions.find((item) => item.student.equals(users.studentA._id)).toObject();
          const form = admin.page.getByRole('form', { name: 'Chấm bài của Học sinh B', exact: true });
          await form.getByLabel('Điểm (0–10)', { exact: true }).fill('8');
          await form.getByLabel('Nhận xét', { exact: true }).fill('Admin đã kiểm tra B');
          admin.page.once('dialog', (dialog) => dialog.accept());
          const response = admin.page.waitForResponse((res) => new URL(res.url()).pathname === `${detailPath}/grade` && res.request().method() === 'POST');
          await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
          assert.equal((await response).status(), 200);
          await admin.page.getByText('Admin đã kiểm tra B', { exact: false }).first().waitFor();
          assert.equal(admin.writes.length, 1);
          const saved = await Assignment.findById(assignment._id);
          assert.equal(saved.submissions.find((item) => item.student.equals(users.studentB._id)).score, 8);
          assert.deepEqual(saved.submissions.find((item) => item.student.equals(users.studentA._id)).toObject(), beforeA);
          const ownB = await b.open();
          assert.equal(ownB.submissions[0].feedback, 'Admin đã kiểm tra B');
          assert.equal(JSON.stringify(ownB).includes(feedbackA), false);
        });
        await check(`${viewport.width}: bốn phiên không lỗi trang, không tràn ngang hoặc gọi mạng ngoài`, async () => {
          for (const [key, record] of Object.entries(records)) {
            const widths = await record.page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
            assert.ok(widths.scroll <= widths.viewport + 1);
            assert.deepEqual(record.errors, []);
            assert.deepEqual(record.external, []);
            await record.page.screenshot({ path: path.join(output, `${key}-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
          }
        });
      } finally { for (const context of contexts) await context.close(); }
    }
    report.status = 'completed';
  } catch (error) {
    report.status = 'failed';
    report.failure = { name: error.name, message: error.message.slice(0, 1200) };
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await mongoose.disconnect();
    report.cleanup = await resource.cleanup();
    if (!report.cleanup.containerRemoved || !report.cleanup.databaseDropped) process.exitCode = 1;
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Báo cáo UI bài tập: ${output}; status: ${report.status}`);
  }
}
main().catch((error) => { console.error(error.name); process.exitCode = 1; });
