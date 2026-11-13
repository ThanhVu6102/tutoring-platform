const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createLab } = require('./lib/isolated-mongo');

// Lab sở hữu riêng: kiểm chứng UI quản trị và quyền/ghi thật, không nạp cấu hình production.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--tools-dir' || !path.isAbsolute(args[1])) throw new Error('Cần --tools-dir tuyệt đối');
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(args[1], 'browsers');
  const { chromium } = require(path.join(args[1], 'node_modules/playwright'));
  const build = path.resolve(__dirname, '../../frontend/build');
  assert.ok(fs.existsSync(path.join(build, 'index.html')), 'Cần build frontend trước');
  const resource = await createLab();
  const output = path.resolve(__dirname, '../../docs/local/security', `accounts-ui-${resource.id}`);
  fs.mkdirSync(output, { recursive: true });
  const report = { status: 'running', checks: [], startedAt: new Date().toISOString(), environment: {
    image: resource.image, data: 'synthetic Docker only', backend: 'real routers + MongoDB', frontend: 'production build',
    authentication: 'admin real UI login; signed synthetic tokens for API/route negative tests', network: 'browser loopback only' } };
  const previous = process.env.JWT_SECRET;
  const secret = crypto.randomBytes(32).toString('hex');
  const password = crypto.randomBytes(24).toString('base64url');
  const secrets = [secret, password];
  process.env.JWT_SECRET = secret;
  let server;
  let browser;
  try {
    await mongoose.connect(resource.uri, { dbName: resource.database, serverSelectionTimeoutMS: 15000 });
    const User = require('../models/User');
    const AuditLog = require('../models/AuditLog');
    const admin = await User.create({ name: 'Admin kiểm thử', email: 'accounts-admin@example.test', password, role: 'admin', status: 'active' });
    const teacher = await User.create({ name: 'Giáo viên hoạt động', email: 'accounts-teacher@example.test', password, role: 'teacher', status: 'active' });
    const student = await User.create({ name: 'Học sinh kiểm thử', email: 'accounts-student@example.test', password, role: 'student', status: 'active' });
    await User.collection.insertMany(Array.from({ length: 42 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(),
      name: `Học sinh ${String(i).padStart(3, '0')}`, email: `accounts-student-${i}@example.test`, role: 'student', status: 'active',
      deletedAt: null, createdAt: new Date(Date.now() - i * 1000) })));
    const app = express();
    app.use(express.json());
    for (const [mount, file] of [['auth', 'auth'], ['users', 'users'], ['classes', 'classes'], ['student-warnings', 'studentWarnings']]) {
      app.use(`/api/${mount}`, require(`../routes/${file}`));
    }
    app.use('/api', (req, res) => res.sendStatus(404));
    app.use(express.static(build));
    app.get('*', (req, res) => res.sendFile(path.join(build, 'index.html')));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const tokens = new Map([admin, teacher, student].map((user) => {
      const token = jwt.sign({ userId: String(user._id), role: user.role }, secret, { expiresIn: '15m' });
      secrets.push(token); return [String(user._id), token];
    }));
    const request = async (user, route, body, method = body === undefined ? 'GET' : 'PUT') => {
      const response = await fetch(`${base}/api${route}`, { method,
        headers: { ...(user ? { Authorization: `Bearer ${tokens.get(String(user._id))}` } : {}), 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await response.json();
      if (data.token) secrets.push(data.token);
      return { status: response.status, data };
    };
    const check = async (name, fn) => { await fn(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
    await check('HTTP: thiếu phiên/teacher/student không được đọc hoặc duyệt tài khoản', async () => {
      const before = await User.findById(teacher._id).lean();
      for (const actor of [null, teacher, student]) {
        const expected = actor ? 403 : 401;
        assert.equal((await request(actor, '/users')).status, expected);
        for (const action of ['approve', 'reject']) assert.equal((await request(actor, `/users/${teacher._id}/${action}`, {})).status, expected);
      }
      assert.deepEqual(await User.findById(teacher._id).lean(), before);
    });
    await check('HTTP: phân trang/filter chính xác, escape search, không lộ hash hoặc revision', async () => {
      const result = await request(admin, '/users?role=student&status=active&view=moderation&limit=20&page=2');
      assert.equal(result.status, 200); assert.equal(result.data.data.length, 20); assert.equal(result.data.total, 43);
      assert.ok(result.data.data.every((user) => user.role === 'student' && !Object.hasOwn(user, 'password')
        && !Object.hasOwn(user, 'scheduleRevision') && !Object.hasOwn(user, 'warningRevision')));
      assert.equal((await request(admin, '/users?search=%5B')).data.total, 0);
      assert.equal((await request(admin, '/users?page=invalid')).status, 400);
      for (const actor of [admin, student, teacher]) assert.equal((await request(admin, `/users/${actor._id}/approve`, {})).status, 409);
    });
    await check('MongoDB: note sai không ghi, hai quyết định đồng thời chỉ một thắng và một audit', async () => {
      const target = await User.create({ name: 'Giáo viên tranh chấp', email: 'accounts-concurrent@example.test', password,
        role: 'teacher', status: 'pending' });
      const before = await User.findById(target._id).lean();
      for (const note of [{ invalid: true }, 'x'.repeat(2001)]) {
        assert.equal((await request(admin, `/users/${target._id}/reject`, { note })).status, 400);
        assert.deepEqual(await User.findById(target._id).lean(), before);
      }
      const results = await Promise.all([request(admin, `/users/${target._id}/approve`, {}),
        request(admin, `/users/${target._id}/reject`, { note: 'Quyết định cạnh tranh' })]);
      assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
      const winner = results.find((item) => item.status === 200).data.user.status;
      const saved = await User.findById(target._id).lean();
      assert.equal(saved.status, winner);
      assert.equal(String(saved.review.reviewedBy), String(admin._id));
      assert.equal(await AuditLog.countDocuments({ targetId: target._id }), 1);
    });
    browser = await chromium.launch({ headless: true });
    report.environment.browserVersion = browser.version();
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
      const targets = {};
      for (const action of ['approve', 'reject', 'race']) targets[action] = await User.create({
        name: `Giáo viên ${action} ${viewport.width}`, email: `accounts-${action}-${viewport.width}@example.test`,
        password, role: 'teacher', status: 'pending' });
      const context = await browser.newContext({ viewport });
      const external = [];
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === base || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
        external.push(url.origin); return route.abort();
      });
      try {
        const page = await context.newPage();
        const errors = [];
        const writes = [];
        page.on('pageerror', (error) => errors.push(error.name));
        page.on('request', (req) => {
          if (req.method() === 'PUT' && /\/api\/users\/[^/]+\/(approve|reject)$/.test(new URL(req.url()).pathname)) writes.push(req);
        });
        const pagination = page.getByRole('navigation', { name: 'Phân trang tài khoản', exact: true });
        const waitList = () => {
          const result = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/users' && res.request().method() === 'GET');
          // Nếu thao tác UI cũng lỗi, đánh dấu promise đã được quan sát để finally vẫn dọn lab.
          // Promise gốc vẫn được await và vẫn ném lỗi; không biến timeout thành test đạt.
          result.catch(() => {});
          return result;
        };
        const search = async (value) => {
          const response = waitList();
          await page.getByLabel('Tìm tên hoặc email', { exact: true }).fill(value);
          assert.equal((await response).status(), 200);
          await pagination.getByRole('button', { name: 'Làm mới', exact: true }).waitFor();
          await page.waitForFunction(() => !document.querySelector('.accounts-grid')?.matches('[aria-busy="true"]'));
        };
        await check(`${viewport.width}: admin đăng nhập thật và mở trang từ navbar, phân trang server`, async () => {
          await page.goto(`${base}/login`);
          await page.locator('input[type="email"]').fill(admin.email);
          await page.locator('input[placeholder="Nhập mật khẩu"]').fill(password);
          await page.getByRole('button', { name: 'Đăng Nhập', exact: true }).click();
          await page.waitForURL('**/admin');
          if (viewport.width < 600) await page.getByRole('button', { name: 'Mở menu điều hướng', exact: true }).click();
          const loaded = waitList();
          await page.getByRole('button', { name: 'Quản lý tài khoản', exact: true }).click();
          const body = await (await loaded).json();
          assert.equal(body.data.length, 20); assert.ok(body.total > 40);
          await page.getByRole('heading', { name: 'Quản lý tài khoản', exact: true }).waitFor();
          await page.screenshot({ path: path.join(output, `accounts-list-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
          const next = waitList();
          await pagination.getByRole('button', { name: 'Sau', exact: true }).click();
          const response = await next;
          assert.equal(new URL(response.url()).searchParams.get('page'), '2');
          await page.waitForFunction(() => document.querySelector('.pagination-controls')?.textContent.includes('Trang 2/'));
        });
        await check(`${viewport.width}: kết hợp role/status/search, rỗng và xóa bộ lọc về trang 1`, async () => {
          const roleResponse = waitList();
          await page.getByLabel('Vai trò', { exact: true }).selectOption('teacher'); await roleResponse;
          const statusResponse = waitList();
          await page.getByLabel('Trạng thái', { exact: true }).selectOption('pending'); await statusResponse;
          await search(targets.approve.email);
          await page.getByRole('heading', { name: targets.approve.name, exact: true }).waitFor();
          assert.equal(await page.locator('.account-card').count(), 1);
          await search('not-existing@example.test');
          await page.getByText('Không có tài khoản phù hợp bộ lọc.', { exact: true }).waitFor();
          const cleared = waitList();
          await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click(); await cleared;
          await page.waitForFunction(() => document.querySelector('.pagination-controls')?.textContent.includes('Trang 1/'));
        });
        for (const action of ['approve', 'reject']) await check(`${viewport.width}: ${action} qua xác nhận UI chỉ một lần, DB/audit/login đúng`, async () => {
          const target = targets[action];
          const before = await request(null, '/auth/login', { email: target.email, password }, 'POST');
          assert.equal(before.status, 403);
          await search(target.email);
          const card = page.locator('.account-card').filter({ has: page.getByRole('heading', { name: target.name, exact: true }) });
          await card.getByRole('button', { name: action === 'approve' ? 'Duyệt giáo viên' : 'Từ chối giáo viên', exact: true }).click();
          const form = page.getByRole('form', { name: 'Xét duyệt giáo viên', exact: true });
          if (action === 'reject') await form.getByLabel('Lý do từ chối (không bắt buộc)', { exact: true }).fill('Cần bổ sung hồ sơ kiểm thử');
          if (action === 'reject') {
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({ path: path.join(output, `accounts-review-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
          }
          const beforeCount = writes.length;
          const result = page.waitForResponse((res) => new URL(res.url()).pathname === `/api/users/${target._id}/${action}` && res.request().method() === 'PUT');
          await form.getByRole('button', { name: action === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối', exact: true })
            .evaluate((button) => { button.click(); button.click(); });
          assert.equal((await result).status(), 200);
          await page.getByText(action === 'approve' ? 'Đã duyệt hồ sơ giáo viên.' : 'Đã từ chối hồ sơ giáo viên.', { exact: true }).waitFor();
          assert.equal(writes.length - beforeCount, 1);
          assert.deepEqual(writes.at(-1).postDataJSON(), action === 'approve' ? {} : { note: 'Cần bổ sung hồ sơ kiểm thử' });
          const saved = await User.findById(target._id).lean();
          assert.equal(saved.status, action === 'approve' ? 'active' : 'rejected');
          assert.equal(String(saved.review.reviewedBy), String(admin._id)); assert.ok(saved.review.reviewedAt instanceof Date);
          if (action === 'reject') assert.equal(saved.review.note, 'Cần bổ sung hồ sơ kiểm thử');
          assert.equal(await AuditLog.countDocuments({ targetId: target._id, actorId: admin._id, action: action === 'approve' ? 'approve_user' : 'reject_user' }), 1);
          const login = await request(null, '/auth/login', { email: target.email, password }, 'POST');
          assert.equal(login.status, action === 'approve' ? 200 : 403);
        });
        await check(`${viewport.width}: xung đột admin khác xử lý không ghi đè, chỉ reload`, async () => {
          await search(targets.race.email);
          await page.getByRole('button', { name: 'Duyệt giáo viên', exact: true }).click();
          assert.equal((await request(admin, `/users/${targets.race._id}/reject`, { note: 'Quyết định trước' })).status, 200);
          const response = page.waitForResponse((res) => new URL(res.url()).pathname === `/api/users/${targets.race._id}/approve`);
          await page.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).click();
          assert.equal((await response).status(), 409);
          await page.getByText('Hồ sơ đã được xử lý hoặc không còn chờ duyệt. Danh sách đã được tải lại.', { exact: true }).waitFor();
          assert.equal((await User.findById(targets.race._id)).status, 'rejected');
          assert.equal(await AuditLog.countDocuments({ targetId: targets.race._id }), 1);
        });
        await check(`${viewport.width}: lỗi tải/thử lại không ghi, responsive và không gọi mạng ngoài`, async () => {
          await page.route('**/api/users?*', async (route) => {
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'internal-do-not-display' }) });
          }, { times: 1 });
          await pagination.getByRole('button', { name: 'Làm mới', exact: true }).click();
          await pagination.getByRole('button', { name: 'Thử lại', exact: true }).waitFor();
          assert.equal(await page.getByText('internal-do-not-display', { exact: false }).count(), 0);
          const response = waitList();
          await pagination.getByRole('button', { name: 'Thử lại', exact: true }).click(); assert.equal((await response).status(), 200);
          await pagination.getByRole('alert').waitFor({ state: 'hidden' });
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: path.join(output, `accounts-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
          assert.deepEqual(errors, []); assert.deepEqual(external, []);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        });
      } finally { await context.close(); }
      for (const actor of [student, teacher]) await check(`${viewport.width}: route ${actor.role} không mở trang admin`, async () => {
        const ctx = await browser.newContext({ viewport });
        try {
          await ctx.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
          await ctx.addInitScript(({ token, role, id }) => {
            localStorage.setItem('token', token); localStorage.setItem('userRole', role); localStorage.setItem('userId', id);
          }, { token: tokens.get(String(actor._id)), role: actor.role, id: String(actor._id) });
          const page = await ctx.newPage();
          await page.goto(`${base}/admin/accounts`); await page.waitForURL('**/dashboard');
          assert.equal(await page.getByRole('heading', { name: 'Quản lý tài khoản', exact: true }).count(), 0);
        } finally { await ctx.close(); }
      });
    }
    report.status = 'completed';
  } catch (error) {
    let message = String(error.message);
    for (const value of secrets) message = message.split(value).join('[REDACTED]');
    report.status = 'failed'; report.failure = { name: error.name, message: message.slice(0, 1200) };
    console.error(report.failure.message); process.exitCode = 1;
  } finally {
    try { if (browser) await browser.close(); }
    finally {
      try { if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } }
      finally {
        try { await mongoose.disconnect(); }
        finally {
          try { report.cleanup = await resource.cleanup(); }
          finally {
            if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous;
            report.finishedAt = new Date().toISOString();
            fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
            console.log(`Báo cáo tài khoản: ${output}; status: ${report.status}`);
          }
        }
      }
    }
  }
}
main().catch((error) => { console.error(error.name); process.exitCode = 1; });
