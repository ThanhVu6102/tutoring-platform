const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createLab } = require('./lib/isolated-mongo');
const { fixtures } = require('./lib/performance-lab');

// Playwright nằm riêng ở thư mục công cụ tạm, không thêm dependency cho ứng dụng.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--tools-dir' || !path.isAbsolute(args[1])) {
    throw new Error('Usage: node backend/scripts/browser-smoke.js --tools-dir <absolute temporary tooling folder>');
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(args[1], 'browsers');
  const { chromium } = require(path.join(args[1], 'node_modules/playwright'));
  const build = path.resolve(__dirname, '../../frontend/build');
  assert.ok(fs.existsSync(path.join(build, 'index.html')), 'Build frontend first');
  const resource = await createLab();
  const output = path.resolve(__dirname, '../../docs/local/performance', `browser-${resource.id}`);
  fs.mkdirSync(output, { recursive: true });
  const report = { startedAt: new Date().toISOString(), status: 'running', checks: [],
    environment: { image: resource.image, browser: 'Chromium', authentication: 'synthetic JWT; not a login test',
      dataset: 'synthetic local only', backend: 'real routers and MongoDB', frontend: 'production build' } };
  let server;
  let browser;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(resource.uri, { dbName: resource.database, serverSelectionTimeoutMS: 15000 });
    const fixture = fixtures(mongoose, { users: 120, classes: 45, warnings: 45, items: 1 });
    // Tạo hơn một trang cho teacher/student, vẫn giữ lớp ngoài phạm vi để kiểm tra quyền.
    fixture.data.Class.forEach((cls, index) => {
      if (index < 35) cls.teacher = fixture.teacher._id;
      if (index < 35 && !cls.students.some((id) => id.equals(fixture.student._id))) cls.students.push(fixture.student._id);
    });
    fixture.student.enrolledClasses = fixture.data.Class.filter((cls) => cls.students.some((id) => id.equals(fixture.student._id))).map((cls) => cls._id);
    for (const [name, rows] of Object.entries(fixture.data)) {
      const model = require(`../models/${name}`);
      await model.init();
      if (rows.length) await model.collection.insertMany(rows);
    }
    const app = express();
    app.use(express.json());
    app.use('/api', require('../middleware/apiPerformance'));
    for (const route of ['classes', 'users', 'videos', 'documents', 'assignments', 'announcements', 'quizzes', 'studentWarnings', 'moderation']) {
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
      for (const role of ['admin', 'teacher', 'student']) {
        const label = `${role}-${viewport.width}`;
        const context = await browser.newContext({ viewport });
        const external = [];
        // Chặn mạng ngoài trước khi mở trang: tuyệt đối không gửi JWT test tới host khác.
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.origin === base || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
          external.push(url.origin);
          return route.abort();
        });
        const token = jwt.sign({ userId: String(fixture[role]._id), role }, process.env.JWT_SECRET, { expiresIn: '15m' });
        await context.addInitScript(({ token: value, role: userRole, id }) => {
          localStorage.setItem('token', value);
          localStorage.setItem('userRole', userRole);
          localStorage.setItem('userId', id);
        }, { token, role, id: String(fixture[role]._id) });
        const page = await context.newPage();
        const errors = [];
        const requests = [];
        page.on('pageerror', (error) => errors.push(error.name));
        page.on('request', (request) => {
          const url = new URL(request.url());
          if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, query: url.search, method: request.method() });
        });
        const pagination = () => page.locator('.pagination-controls').first();
        const waitReady = async () => {
          await page.waitForFunction(() => {
            const nav = document.querySelector('.pagination-controls');
            return nav && !nav.querySelector('[role="status"]');
          });
        };
        await check(`${label}: dashboard and pagination`, async () => {
          await page.goto(`${base}${role === 'admin' ? '/admin' : '/dashboard'}`);
          await waitReady();
          assert.match(await pagination().innerText(), /Trang 1\//);
          assert.ok(await pagination().getByRole('button', { name: 'Sau', exact: true }).isEnabled());
          await pagination().getByRole('button', { name: 'Sau', exact: true }).click();
          await page.waitForFunction(() => /Trang 2\//.test(document.querySelector('.pagination-controls')?.textContent || ''));
          await waitReady();
        });
        if (role === 'admin') {
          await check(`${label}: combined filters, empty and reset`, async () => {
            await page.getByLabel('Tìm tên hoặc mô tả lớp').fill('000001');
            await page.waitForFunction(() => document.querySelector('.pagination-controls')?.textContent.includes('1 kết quả'));
            await page.getByLabel('Môn học', { exact: true }).fill('English');
            await page.getByLabel('Khối / trình độ').fill('11');
            await page.getByLabel(/^Trạng thái/).selectOption('active');
            await page.getByLabel('Giáo viên (email hoặc ID)').fill(fixture.teacher.email.toUpperCase());
            await page.getByLabel(/^Sắp xếp/).selectOption('oldest');
            await waitReady();
            assert.equal(await page.locator('.admin-class-tile').count(), 1);
            await page.getByLabel('Tìm tên hoặc mô tả lớp').fill('no-match-smoke');
            await page.getByText('Không có lớp phù hợp bộ lọc.', { exact: true }).waitFor();
            await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
            await page.waitForFunction(() => document.querySelector('.pagination-controls')?.textContent.includes('45 kết quả'));
          });
          await check(`${label}: transport error and retry`, async () => {
            let fail = true;
            const handler = (route) => {
              if (fail) { fail = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Lỗi thử nghiệm local' }) }); }
              return route.continue();
            };
            await page.route('**/api/classes?*', handler);
            await pagination().getByRole('button', { name: 'Làm mới', exact: true }).click();
            await pagination().getByRole('button', { name: 'Thử lại', exact: true }).waitFor();
            // Chờ response và trạng thái UI mới, tránh đọc trạng thái cũ ngay sau click.
            const retried = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/classes' && res.status() === 200);
            await pagination().getByRole('button', { name: 'Thử lại', exact: true }).click();
            await retried;
            await pagination().getByRole('button', { name: 'Làm mới', exact: true }).waitFor();
            await pagination().getByRole('alert').waitFor({ state: 'hidden' });
            await waitReady();
            assert.equal(await pagination().getByRole('alert').count(), 0);
            await page.unroute('**/api/classes?*', handler);
          });
          await check(`${label}: moderation loads only active tab`, async () => {
            requests.length = 0;
            await page.goto(`${base}/admin/moderation`);
            await waitReady();
            await page.waitForFunction(() => document.querySelector('[aria-label="Tổng quan hồ sơ vi phạm"] strong')?.textContent === '45');
            assert.equal(requests.filter((req) => req.path.startsWith('/api/')).length, 2);
            assert.equal(await page.locator('.admin-warning-card').count(), 20);
            await pagination().getByRole('button', { name: 'Sau', exact: true }).click();
            await page.waitForFunction(() => /Trang 2\//.test(document.querySelector('.pagination-controls')?.textContent || ''));
            await waitReady();
            assert.equal(await page.locator('.admin-warning-card').count(), 20);
            for (const [name, endpoint] of [
              ['Học sinh bị xử lý', '/api/moderation/students'],
              ['Tài khoản học sinh', '/api/users'], ['Lớp vi phạm', '/api/moderation/classes'],
              ['Cảnh báo & kháng cáo', null],
            ]) {
              const response = endpoint ? page.waitForResponse((res) => new URL(res.url()).pathname === endpoint && res.status() === 200) : null;
              await page.getByRole('tab', { name, exact: true }).click();
              if (response) await response;
              await waitReady();
            }
          });
          if (viewport.width > 600) {
            await check(`${label}: review is single-submit and refreshes summary`, async () => {
              const beforeCount = requests.filter((req) => req.method === 'PATCH').length;
              const button = page.getByRole('button', { name: 'Chấp thuận, gỡ cảnh báo', exact: true }).first();
              const response = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/review') && res.request().method() === 'PATCH');
              const summary = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/moderation/summary');
              page.once('dialog', (dialog) => dialog.accept());
              // Hai sự kiện cùng lượt trên cùng nút phải chỉ tạo một request thật.
              await button.evaluate((element) => { element.click(); element.click(); });
              assert.equal((await response).status(), 200);
              await summary;
              await waitReady();
              assert.equal(requests.filter((req) => req.method === 'PATCH').length - beforeCount, 1);
            });
          }
        } else {
          await check(`${label}: class overview lazy content loading`, async () => {
            requests.length = 0;
            await page.goto(`${base}/class/${fixture.cls._id}`);
            await page.getByRole('button', { name: 'Video', exact: true }).waitFor();
            await page.waitForLoadState('networkidle');
            const contentPaths = ['videos', 'documents', 'assignments', 'announcements', 'quizzes'];
            assert.equal(requests.filter((req) => contentPaths.some((type) => req.path.startsWith(`/api/${type}/class/`))).length, 0);
            assert.ok(requests.some((req) => req.path.endsWith('/content-summary')));
            await page.getByRole('button', { name: 'Video', exact: true }).click();
            await waitReady();
            assert.ok(requests.some((req) => req.path.startsWith('/api/videos/class/')));
            assert.equal(requests.filter((req) => ['documents', 'assignments', 'announcements', 'quizzes'].some((type) => req.path.startsWith(`/api/${type}/class/`))).length, 0);
          });
          await check(`${label}: admin route remains inaccessible`, async () => {
            await page.goto(`${base}/admin`);
            await page.waitForURL('**/dashboard');
            await waitReady();
          });
        }
        await check(`${label}: responsive navigation and no page crash`, async () => {
          if (viewport.width < 600) {
            const toggle = page.getByRole('button', { name: 'Mở menu điều hướng', exact: true });
            await toggle.click();
            assert.equal(await page.getByRole('button', { name: 'Đóng menu điều hướng', exact: true }).getAttribute('aria-expanded'), 'true');
            await page.getByRole('button', { name: role === 'admin' ? 'Quản trị lớp' : 'Trang chủ', exact: true }).click();
            await waitReady();
          }
          const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(width.scroll <= width.viewport + 1, `Horizontal overflow: ${width.scroll}/${width.viewport}`);
          assert.deepEqual(errors, []);
          assert.deepEqual(external, []);
          await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true, animations: 'disabled' });
        });
        await context.close();
      }
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
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Browser report: ${output}; status: ${report.status}`);
  }
}
main().catch((error) => { console.error(error.name); process.exitCode = 1; });
