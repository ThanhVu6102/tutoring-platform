const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('./helpers/jwtEnvironment');
const User = require('../models/User');
const StudentWarning = require('../models/StudentWarning');
const { jwtSecret } = require('../config/jwt');
const { authMiddleware } = require('../middleware/auth');
const actorId = 'a'.repeat(24);

function restoreSecret(t) {
  const previous = process.env.JWT_SECRET;
  t.after(() => { process.env.JWT_SECRET = previous; });
}

async function client(t) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  app.get('/protected', authMiddleware, (req, res) => res.json({ role: req.userRole }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return async (route, { token, body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}

test('JWT từ chối cấu hình thiếu, ngắn, mẫu, lặp hoặc có ký tự điều khiển mà không lộ giá trị', () => {
  for (const secret of [undefined, null, 123, '', 'short', 'a'.repeat(64), 'abcd'.repeat(16),
    'your-secret-key'.repeat(4), 'change-me-'.repeat(5), ` ${randomBytes(32).toString('hex')}`,
    `${randomBytes(32).toString('hex')}\n`, 'x'.repeat(1025)]) {
    assert.throws(() => jwtSecret({ JWT_SECRET: secret }), { message: 'Cấu hình JWT không hợp lệ' });
  }
  const valid = randomBytes(32).toString('hex');
  assert.equal(jwtSecret({ JWT_SECRET: valid }), valid);
});

test('JWT thiếu/sai cấu hình chặn đăng nhập, đăng ký và API bảo vệ trước truy vấn/ghi DB', async (t) => {
  restoreSecret(t);
  for (const method of ['findOne', 'findById', 'exists']) {
    t.mock.method(User, method, () => assert.fail('Không truy vấn tài khoản khi cấu hình sai'));
  }
  t.mock.method(User.prototype, 'save', () => assert.fail('Không tạo tài khoản khi cấu hình sai'));
  const request = await client(t);
  for (const secret of [undefined, 'short']) {
    if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
    for (const route of ['/api/auth/login', '/api/auth/register']) {
      assert.deepEqual(await request(route, { body: { email: 'test@example.test', password: 'Test-password!' } }),
        { status: 503, body: { message: 'Dịch vụ xác thực chưa sẵn sàng' } });
    }
    assert.equal((await request('/protected', { token: 'synthetic.invalid.token' })).status, 503);
  }
});

test('JWT từ chối khóa khác, thuật toán khác, token hết hạn và token không ký trước khi đọc DB', async (t) => {
  t.mock.method(User, 'findById', () => assert.fail('Token sai không được truy vấn DB'));
  const request = await client(t);
  const payload = { userId: actorId, role: 'admin' };
  for (const token of [
    jwt.sign(payload, randomBytes(32).toString('hex')),
    jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS384' }),
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: -1 }),
    jwt.sign(payload, '', { algorithm: 'none' }),
  ]) assert.equal((await request('/protected', { token })).status, 401);
});

test('JWT hợp lệ đăng nhập/ký HS256 và xác thực bằng cùng cấu hình, role vẫn lấy từ DB', async (t) => {
  const user = new User({ _id: actorId, name: 'Kiểm thử', email: 'test@example.test', role: 'student',
    password: await bcrypt.hash('Test-password!', 4), status: 'active' });
  t.mock.method(User, 'findOne', () => ({ select: async () => user }));
  t.mock.method(User, 'findById', () => ({ select() { return this; }, lean: async () => user.toObject() }));
  t.mock.method(StudentWarning, 'countDocuments', async () => 0);
  const request = await client(t);
  const login = await request('/api/auth/login', { body: { email: user.email, password: 'Test-password!' } });
  assert.equal(login.status, 200);
  assert.equal(jwt.decode(login.body.token, { complete: true }).header.alg, 'HS256');
  const decoded = jwt.verify(login.body.token, jwtSecret(), { algorithms: ['HS256'] });
  assert.equal(decoded.exp - decoded.iat, 7 * 86400);
  assert.deepEqual(await request('/protected', { token: login.body.token }), { status: 200, body: { role: 'student' } });
  const forgedRole = jwt.sign({ userId: actorId, role: 'admin' }, jwtSecret());
  assert.equal((await request('/protected', { token: forgedRole })).body.role, 'student');
});

test('JWT đổi khóa vận hành làm token ký bởi khóa cũ không còn được chấp nhận', async (t) => {
  restoreSecret(t);
  const oldToken = jwt.sign({ userId: actorId }, jwtSecret());
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  t.mock.method(User, 'findById', () => assert.fail('Token khóa cũ phải bị chặn trước DB'));
  const request = await client(t);
  assert.equal((await request('/protected', { token: oldToken })).status, 401);
});

test('JWT cấu hình hợp lệ cho phép đăng ký học sinh và ký token cùng khóa', async (t) => {
  t.mock.method(User, 'exists', async () => false);
  t.mock.method(User.prototype, 'save', async function() { return this; });
  const request = await client(t);
  const result = await request('/api/auth/register', { body: {
    name: 'Học sinh kiểm thử', email: 'new-student@example.test', password: 'Test-password!',
    role: 'student', acceptedPolicies: true,
  } });
  assert.equal(result.status, 201);
  assert.equal(jwt.verify(result.body.token, jwtSecret(), { algorithms: ['HS256'] }).role, 'student');
  assert.equal(result.body.user.password, undefined);
});
