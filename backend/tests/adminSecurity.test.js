const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const StudentWarning = require('../models/StudentWarning');
const { adminBootstrapConfig, bootstrapAdmin } = require('../utils/adminBootstrap');
const { changePassword } = require('../utils/changePassword');
const { cachedConnection } = require('../utils/mongoConnection');
const rootEmail = require('../config/defaultAdmin').email;
const actorId = 'a'.repeat(24);
// Giá trị legacy chỉ xuất hiện trong fixture hồi quy, không phải cấu hình ứng dụng.
const legacyPassword = ['Admin', '123!'].join('');
const initialPassword = 'Initial-random-test-password!';
const rotatedPassword = 'Rotated-random-test-password!';

function setEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  });
}

async function loginClient(t) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return async (email, password) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    return { status: response.status, body: await response.json() };
  };
}

test('root and configured admin login use database passwords and password rotation cannot be undone', async (t) => {
  setEnv(t, 'ADMIN_EMAIL', 'configured@example.test');
  setEnv(t, 'ADMIN_PASSWORD', 'Stale-environment-test-password!');
  let record;
  t.mock.method(User, 'findOne', (filter) => {
    if (filter.email) assert.equal(filter.email, record.email);
    return { select: async () => record };
  });
  t.mock.method(User.prototype, 'save', () => assert.fail('Login must never save accounts'));
  t.mock.method(User, 'updateOne', async (filter, update) => {
    assert.equal(filter.password, record.password);
    record.password = update.$set.password;
    return { modifiedCount: 1 };
  });
  const login = await loginClient(t);
  for (const email of [rootEmail, process.env.ADMIN_EMAIL]) {
    record = new User({ _id: actorId, email, name: 'Admin', role: 'admin', status: 'active',
      password: await bcrypt.hash(initialPassword, 4) });
    for (const password of [legacyPassword, process.env.ADMIN_PASSWORD]) {
      const denied = await login(email, password);
      assert.equal(denied.status, 401);
      assert.equal(denied.body.token, undefined);
    }
    const accepted = await login(` ${email.toUpperCase()} `, initialPassword);
    assert.equal(accepted.status, 200);
    assert.equal(jwt.decode(accepted.body.token).role, 'admin');
    assert.equal(accepted.body.user.password, undefined);
    await changePassword(actorId, { currentPassword: initialPassword, newPassword: rotatedPassword });
    for (const password of [legacyPassword, process.env.ADMIN_PASSWORD, initialPassword]) {
      assert.equal((await login(email, password)).status, 401);
    }
    assert.equal((await login(email, rotatedPassword)).status, 200);
    // Env không được nâng quyền của record hiện tại.
    record.role = 'student';
    const student = await login(email, rotatedPassword);
    assert.equal(student.body.user.role, 'student');
    assert.equal(jwt.decode(student.body.token).role, 'student');
  }
});

test('admin login cannot create missing accounts or reactivate restricted accounts', async (t) => {
  setEnv(t, 'ADMIN_EMAIL', 'configured@example.test');
  setEnv(t, 'ADMIN_PASSWORD', initialPassword);
  let record = null;
  t.mock.method(User, 'findOne', () => ({ select: async () => record }));
  t.mock.method(User.prototype, 'save', () => assert.fail('No auto-create or restore'));
  t.mock.method(StudentWarning, 'findOne', () => ({ populate() { return this; }, sort: async () => null }));
  const login = await loginClient(t);
  for (const email of [rootEmail, process.env.ADMIN_EMAIL]) {
    record = null;
    assert.equal((await login(email, initialPassword)).status, 401);
    for (const [restriction, status] of [
      [{ deletedAt: new Date() }, 401], [{ isBlocked: true }, 403],
      [{ status: 'inactive' }, 403], [{ status: 'pending' }, 403],
      [{ status: 'rejected' }, 403], [{ status: 'left' }, 403],
      [{ permanentlyBanned: true }, 403], [{ suspendedUntil: new Date(Date.now() + 60000) }, 423],
    ]) {
      record = new User({ _id: actorId, name: 'Admin', email, role: 'admin',
        password: await bcrypt.hash(initialPassword, 4), ...restriction });
      const denied = await login(email, initialPassword);
      assert.equal(denied.status, status);
      assert.equal(denied.body.token, undefined);
    }
  }
});

test('bootstrap configuration requires explicit email and a bounded non-default password', () => {
  for (const env of [{}, { ADMIN_EMAIL: 'bad', ADMIN_PASSWORD: initialPassword },
    { ADMIN_EMAIL: rootEmail }, { ADMIN_EMAIL: rootEmail, ADMIN_PASSWORD: legacyPassword },
    { ADMIN_EMAIL: rootEmail, ADMIN_PASSWORD: ' '.repeat(20) },
    { ADMIN_EMAIL: rootEmail, ADMIN_PASSWORD: 'é'.repeat(37) }]) {
    assert.throws(() => adminBootstrapConfig(env));
  }
  assert.deepEqual(adminBootstrapConfig({ ADMIN_EMAIL: ' ADMIN@example.test ', ADMIN_PASSWORD: initialPassword }),
    { email: 'admin@example.test', name: 'Quản trị viên', password: initialPassword });
});

test('manual bootstrap hashes new credentials and never overwrites an existing account', async (t) => {
  let exists = false;
  t.mock.method(User, 'exists', async () => exists);
  let writes = 0;
  t.mock.method(User.collection, 'insertOne', async (document) => {
    writes++;
    assert.equal(document.role, 'admin');
    assert.equal(document.status, 'active');
    assert.notEqual(document.password, initialPassword);
    assert.ok(await bcrypt.compare(initialPassword, document.password));
    return { acknowledged: true, insertedId: document._id };
  });
  const config = { email: rootEmail, name: 'Admin', password: initialPassword };
  await bootstrapAdmin(config);
  assert.equal(writes, 1);
  exists = { _id: actorId };
  await assert.rejects(bootstrapAdmin({ ...config, password: rotatedPassword }), /đã tồn tại/);
  assert.equal(writes, 1);
});

test('server connection has no admin initializer and reconnects never write credentials', async (t) => {
  const fs = require('node:fs');
  const server = fs.readFileSync(require.resolve('../server'), 'utf8');
  assert.doesNotMatch(server, /ensureSuperAdmin|superAdmin|adminBootstrap/);
  t.mock.method(User, 'exists', () => assert.fail('Connection must not inspect admin'));
  t.mock.method(User.prototype, 'save', () => assert.fail('Connection must not modify admin'));
  const state = {};
  let calls = 0;
  const connect = cachedConnection(state, async () => { calls++; return { connected: true }; });
  await Promise.all([connect(), connect()]);
  assert.equal(calls, 1);
  state.conn = null;
  state.promise = null;
  await connect();
  assert.equal(calls, 2);
});
