const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { createLab } = require('./lib/isolated-mongo');

// Đăng nhập và đổi mật khẩu thật qua UI, chỉ trên tài khoản ngẫu nhiên trong Docker riêng.
// Không inject JWT, nạp .env/server, nhận URI/tài khoản bên ngoài hoặc đổi user Preview cũ.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--tools-dir' || !path.isAbsolute(args[1])) {
    throw new Error('Cần --tools-dir trỏ tới thư mục Playwright tạm');
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(args[1], 'browsers');
  const { chromium } = require(path.join(args[1], 'node_modules/playwright'));
  const build = path.resolve(__dirname, '../../frontend/build');
  assert.ok(fs.existsSync(path.join(build, 'index.html')), 'Cần build frontend trước');
  const resource = await createLab();
  const output = path.resolve(__dirname, '../../docs/local/security', `password-ui-${resource.id}`);
  fs.mkdirSync(output, { recursive: true });
  const report = { status: 'running', startedAt: new Date().toISOString(), checks: [],
    environment: { image: resource.image, backend: 'real routers + MongoDB', frontend: 'production build',
      authentication: 'real login through UI, not injected JWT', accounts: 'three synthetic students, teacher and admin per viewport',
      network: 'loopback only, external browser traffic blocked', browser: 'Chromium' } };
  const secrets = new Set();
  const redact = (value) => {
    let text = String(value);
    for (const secret of secrets) if (secret) text = text.split(secret).join('[REDACTED]');
    return text.slice(0, 1200);
  };
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  secrets.add(process.env.JWT_SECRET);
  let server;
  let browser;
  try {
    await mongoose.connect(resource.uri, { dbName: resource.database, serverSelectionTimeoutMS: 15000 });
    const User = require('../models/User');
    const app = express();
    app.use(express.json());
    for (const route of ['auth', 'users', 'classes', 'studentWarnings', 'moderation']) {
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
    const check = async (name, fn) => { await fn(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      for (const [index, role] of ['student', 'student', 'student', 'teacher', 'admin'].entries()) {
        const key = `${role}-${index + 1}-${viewport.width}`;
        const initial = crypto.randomBytes(24).toString('base64url');
        const rotated = crypto.randomBytes(24).toString('base64url');
        const wrong = crypto.randomBytes(24).toString('base64url');
        for (const value of [initial, rotated, wrong]) secrets.add(value);
        const user = await User.create({ name: `Tài khoản kiểm thử ${index + 1}`, email: `password-ui-${key}@example.test`,
          password: initial, role, status: 'active' });
        const initialHash = (await User.findById(user._id).select('+password')).password;
        secrets.add(initialHash);
        const context = await browser.newContext({ viewport });
        const external = [];
        const errors = [];
        const mutations = [];
        try {
          // Chặn mạng ngoài trước khi nhập thông tin đăng nhập giả.
          await context.route('**/*', (route) => {
            const url = new URL(route.request().url());
            if (url.origin === base || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
            external.push(url.origin);
            return route.abort();
          });
          const page = await context.newPage();
          page.on('pageerror', (error) => errors.push(error.name));
          page.on('request', (request) => {
            if (request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/users/password') mutations.push(true);
          });
          const login = async (password, expected) => {
            await page.locator('input[placeholder="Nhập email của bạn"]').fill(user.email);
            await page.locator('input[placeholder="Nhập mật khẩu"]').fill(password);
            const result = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/auth/login' && res.request().method() === 'POST');
            await page.getByRole('button', { name: 'Đăng Nhập', exact: true }).click();
            const response = await result;
            assert.equal(response.status(), expected);
            const body = await response.json();
            if (body.token) secrets.add(body.token);
            if (expected === 200) await page.waitForURL(`**/${role === 'admin' ? 'admin' : 'dashboard'}`);
          };
          const form = () => page.getByRole('form', { name: 'Đổi mật khẩu', exact: true });
          const fillPassword = async (current, next, confirm = next) => {
            await form().getByLabel('Mật khẩu hiện tại', { exact: true }).fill(current);
            await form().getByLabel('Mật khẩu mới', { exact: true }).fill(next);
            await form().getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(confirm);
          };
          await check(`${key}: đăng nhập thật, mở hồ sơ từ navbar và form có nhãn/autocomplete`, async () => {
            await page.goto(`${base}/login`);
            await login(initial, 200);
            if (role === 'admin') {
              if (viewport.width < 600) await page.getByRole('button', { name: 'Mở menu điều hướng', exact: true }).click();
              await page.getByRole('button', { name: 'Hồ sơ và mật khẩu', exact: true }).click();
            } else await page.getByRole('button', { name: 'Mở hồ sơ cá nhân', exact: true }).click();
            await page.waitForURL('**/profile');
            await form().waitFor();
            assert.equal(await form().getByLabel('Mật khẩu hiện tại', { exact: true }).getAttribute('autocomplete'), 'current-password');
            assert.equal(await form().getByLabel('Mật khẩu mới', { exact: true }).getAttribute('autocomplete'), 'new-password');
            assert.equal(await form().getByLabel('Nhập lại mật khẩu mới', { exact: true }).getAttribute('type'), 'password');
            await page.getByText(role === 'admin' ? 'Quản lý hồ sơ và mật khẩu tài khoản quản trị của bạn.'
              : role === 'teacher' ? 'Lịch sử thông báo về lớp' : 'Lịch sử cảnh báo', { exact: true }).waitFor();
          });
          await check(`${key}: nhập lại sai không gọi API, mật khẩu hiện tại sai không ghi DB`, async () => {
            await fillPassword(initial, rotated, wrong);
            await form().getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
            await page.getByText('Mật khẩu nhập lại không khớp.', { exact: true }).waitFor();
            assert.equal(mutations.length, 0);
            await fillPassword(wrong, rotated);
            const result = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/users/password' && res.request().method() === 'PATCH');
            await form().getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
            assert.equal((await result).status(), 400);
            await page.getByText('Mật khẩu hiện tại không đúng', { exact: true }).waitFor();
            assert.ok((await User.findById(user._id).select('+password')).password === initialHash);
          });
          await check(`${key}: đổi một lần qua UI, chỉ hash mới lưu DB, xóa ô và không lưu mật khẩu vào storage`, async () => {
            await fillPassword(initial, rotated);
            const before = mutations.length;
            const result = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/users/password' && res.request().method() === 'PATCH');
            await form().getByRole('button', { name: 'Đổi mật khẩu', exact: true }).evaluate((button) => { button.click(); button.click(); });
            const response = await result;
            assert.equal(response.status(), 200);
            // Chỉ so sánh boolean/tên key: lỗi assertion cũng không được in mật khẩu/hash.
            const sent = response.request().postDataJSON();
            assert.deepEqual(Object.keys(sent).sort(), ['currentPassword', 'newPassword']);
            assert.ok(sent.currentPassword === initial && sent.newPassword === rotated);
            assert.deepEqual(Object.keys(await response.json()), ['message']);
            await page.waitForFunction(() => [...document.querySelectorAll('form[aria-label="Đổi mật khẩu"] input')].every((input) => input.value === ''));
            assert.equal(mutations.length - before, 1);
            const saved = await User.findById(user._id).select('+password');
            secrets.add(saved.password);
            assert.ok(saved.password !== initialHash && saved.password !== rotated);
            assert.ok(await bcrypt.compare(rotated, saved.password));
            assert.ok(!await bcrypt.compare(initial, saved.password));
            assert.ok(await page.evaluate((values) => {
              const all = JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]);
              return values.every((value) => !all.includes(value));
            }, [initial, rotated, wrong, saved.password]));
          });
          await check(`${key}: lưu hồ sơ độc lập không gửi mật khẩu và không đổi hash vừa lưu`, async () => {
            const before = (await User.findById(user._id).select('+password')).password;
            const profileForm = page.locator('.profile-editor form');
            await profileForm.getByLabel('Số điện thoại', { exact: true }).fill('0900000000');
            const result = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/users/profile' && res.request().method() === 'PUT');
            await profileForm.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
            const response = await result;
            assert.equal(response.status(), 200);
            const body = response.request().postDataJSON();
            assert.ok(['currentPassword', 'newPassword', 'confirmPassword', 'password'].every((key) => !Object.hasOwn(body, key)));
            await page.getByText('Thông tin cá nhân đã được cập nhật.', { exact: true }).waitFor();
            const saved = await User.findById(user._id).select('+password');
            assert.ok(saved.password === before);
            assert.equal(saved.phone, '0900000000');
          });
          await check(`${key}: đăng xuất, mật khẩu cũ bị từ chối và mật khẩu mới đăng nhập qua UI`, async () => {
            if (viewport.width < 600) await page.getByRole('button', { name: 'Mở menu điều hướng', exact: true }).click();
            // Navbar yêu cầu xác nhận; không để Playwright mặc định hủy hộp thoại.
            page.once('dialog', (dialog) => dialog.accept());
            await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
            await page.waitForURL('**/login');
            await login(initial, 401);
            assert.ok(await page.evaluate(() => !localStorage.getItem('token')));
            await login(rotated, 200);
            await page.goto(`${base}/profile`);
            await form().waitFor();
            assert.deepEqual(errors, []);
            assert.deepEqual(external, []);
            const widths = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
            assert.ok(widths.scroll <= widths.viewport + 1);
            assert.ok(await form().locator('input').evaluateAll((inputs) => inputs.every((input) => input.value === '')));
            await page.screenshot({ path: path.join(output, `${key}.png`), fullPage: true, animations: 'disabled' });
          });
        } finally { await context.close(); }
      }
    }
    report.status = 'completed';
  } catch (error) {
    report.status = 'failed';
    report.failure = { name: error.name, message: redact(error.message) };
    console.error(redact(error.message));
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
    console.log(`Báo cáo UI mật khẩu: ${output}; status: ${report.status}`);
  }
}
main().catch((error) => { console.error(error.name); process.exitCode = 1; });
