const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { changePassword } = require('../utils/changePassword');
const DEFAULT_ADMIN = require('../config/defaultAdmin');
const actorId = 'a'.repeat(24);
const oldPassword = 'Old-password-test!';
const newPassword = 'New-password-test!';
const input = { currentPassword: oldPassword, newPassword };

test('password validation rejects malformed input before reading the database', async (t) => {
  t.mock.method(User, 'findOne', () => assert.fail('Invalid data must not query database'));
  for (const body of [undefined, null, [], {}, { ...input, currentPassword: [] },
    { ...input, currentPassword: 'x'.repeat(73) }, { ...input, newPassword: '12345' },
    { ...input, newPassword: {} }, { ...input, newPassword: 'é'.repeat(37) }]) {
    await assert.rejects(changePassword(actorId, body), { statusCode: 400 });
  }
});

test('password changes hash without trimming and target only the authenticated user', async (t) => {
  const hash = await bcrypt.hash(oldPassword, 4);
  t.mock.method(User, 'findOne', (filter) => {
    assert.equal(filter._id, actorId);
    assert.equal(filter.deletedAt, null);
    return { select: async () => ({ email: 'test@example.test', password: hash }) };
  });
  const rawNew = '  New-password-test!  ';
  t.mock.method(User, 'updateOne', async (filter, update, options) => {
    assert.equal(filter._id, actorId);
    assert.equal(filter.password, hash);
    assert.equal(filter.isBlocked.$ne, true);
    assert.ok(filter.$or);
    assert.ok(await bcrypt.compare(rawNew, update.$set.password));
    assert.equal(await bcrypt.compare(rawNew.trim(), update.$set.password), false);
    assert.equal(options.runValidators, true);
    assert.ok(update.$set.updatedAt instanceof Date);
    return { modifiedCount: 1 };
  });
  assert.equal(await changePassword(actorId, { ...input, newPassword: rawNew, userId: 'b'.repeat(24) }), undefined);
});

test('wrong, unchanged, inactive and configured administrator passwords cannot be changed', async (t) => {
  let record = { email: 'student@example.test', password: await bcrypt.hash(oldPassword, 4) };
  t.mock.method(User, 'findOne', () => ({ select: async () => record }));
  t.mock.method(User, 'updateOne', () => assert.fail('Rejected requests must not write'));
  await assert.rejects(changePassword(actorId, { ...input, currentPassword: 'Wrong-password!' }), { statusCode: 400 });
  await assert.rejects(changePassword(actorId, { ...input, newPassword: oldPassword }), { statusCode: 400 });
  record.email = DEFAULT_ADMIN.email;
  await assert.rejects(changePassword(actorId, input), { statusCode: 403 });
  record = null;
  await assert.rejects(changePassword(actorId, input), { statusCode: 403 });
});

test('conditional password writes allow only one competing change', async (t) => {
  const hash = await bcrypt.hash(oldPassword, 4);
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ email: 'test@example.test', password: hash }) }));
  let current = hash;
  t.mock.method(User, 'updateOne', async (filter, update) => {
    if (filter.password !== current) return { modifiedCount: 0 };
    current = update.$set.password;
    return { modifiedCount: 1 };
  });
  const results = await Promise.allSettled([changePassword(actorId, input), changePassword(actorId, input)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.statusCode, 409);
  assert.ok(await bcrypt.compare(newPassword, current));
  assert.equal(await bcrypt.compare(oldPassword, current), false);
});

test('exactly 72 UTF-8 bytes is accepted and configuration-managed admins remain protected', async (t) => {
  const hash = await bcrypt.hash(oldPassword, 4);
  let email = 'student@example.test';
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ email, password: hash }) }));
  t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));
  await changePassword(actorId, { ...input, newPassword: 'é'.repeat(36) });
  const previous = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
  try {
    process.env.ADMIN_EMAIL = 'configured@example.test';
    process.env.ADMIN_PASSWORD = 'configuration-only-test';
    email = 'configured@example.test';
    await assert.rejects(changePassword(actorId, input), { statusCode: 403 });
  } finally {
    for (const [key, value] of [['ADMIN_EMAIL', previous.email], ['ADMIN_PASSWORD', previous.password]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('HTTP password route authenticates, hides secrets and blocks inactive users', async (t) => {
  let user = { role: 'student', status: 'active' };
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => user }) }));
  const hash = await bcrypt.hash(oldPassword, 4);
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ email: 'test@example.test', password: hash }) }));
  t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 1 }));
  const app = express();
  app.use(express.json());
  app.use('/api/users', require('../routes/users'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const token = jwt.sign({ userId: actorId }, process.env.JWT_SECRET || 'your-secret-key');
  const request = async (authenticated = true) => {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/users/password`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(input),
    });
    return { status: result.status, data: await result.json() };
  };
  assert.equal((await request(false)).status, 401);
  const result = await request();
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.data), ['message']);
  user = { role: 'student', status: 'inactive' };
  assert.equal((await request()).status, 403);
  user = { role: 'student', status: 'active', suspendedUntil: new Date(Date.now() + 60000) };
  assert.equal((await request()).status, 423);
  user = { role: 'student', status: 'active', permanentlyBanned: true };
  assert.equal((await request()).status, 403);
  user = { role: 'student', status: 'active', deletedAt: new Date() };
  assert.equal((await request()).status, 401);
  user = { role: 'student', status: 'active' };
  t.mock.method(User, 'updateOne', async () => { throw new Error('PRIVATE_INTERNAL_HASH_QUERY'); });
  const failure = await request();
  assert.equal(failure.status, 500);
  assert.ok(!JSON.stringify(failure.data).includes('PRIVATE_INTERNAL_HASH_QUERY'));
});
