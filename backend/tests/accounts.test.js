const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { reviewTeacher } = require('../utils/reviewTeacher');
const { authMiddleware } = require('../middleware/auth');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

test('review uses atomic pending-only update and records reviewer', async (t) => {
  let pending = true;
  const calls = [];
  t.mock.method(User, 'findOneAndUpdate', async (filter, update, options) => {
    calls.push({ filter, update, options });
    if (!pending) return null;
    pending = false;
    return { status: update.$set.status };
  });
  const args = { userId: 'a'.repeat(24), actorId: 'b'.repeat(24), status: 'active' };
  const results = await Promise.all([reviewTeacher(args), reviewTeacher(args)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(calls[0].filter.status, 'pending');
  assert.equal(calls[0].filter.role, 'teacher');
  assert.equal(calls[0].filter.deletedAt, null);
  assert.equal(calls[0].update.$set.review.reviewedBy, args.actorId);
  assert.equal(calls[0].options.runValidators, true);
});

test('review rejects invalid decision and oversized notes', async () => {
  await assert.rejects(reviewTeacher({ status: 'pending' }), TypeError);
  await assert.rejects(reviewTeacher({ status: 'rejected', note: 'x'.repeat(2001) }), TypeError);
});

test('middleware uses database role and rejects inactive admins', async (t) => {
  let user = { role: 'student', status: 'active' };
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => user }) }));
  const token = jwt.sign({ userId: 'a'.repeat(24), role: 'admin' }, process.env.JWT_SECRET || 'your-secret-key');
  const req = { header: () => `Bearer ${token}` };
  let passed = false;
  await authMiddleware(req, response(), () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(req.userRole, 'student');
  for (const state of [
    { role: 'admin', status: 'inactive' },
    { role: 'student', status: 'active', isBlocked: true },
    { role: 'student', status: 'active', deletedAt: new Date() },
  ]) {
    user = state;
    const res = response();
    await authMiddleware(req, res, () => assert.fail('Must deny access'));
    assert.ok([401, 403].includes(res.statusCode));
  }
});

test('malformed token identity returns 401 without querying database', async () => {
  const token = jwt.sign({ userId: { $ne: null } }, process.env.JWT_SECRET || 'your-secret-key');
  const res = response();
  await authMiddleware({ header: () => `Bearer ${token}` }, res, () => assert.fail());
  assert.equal(res.statusCode, 401);
});
