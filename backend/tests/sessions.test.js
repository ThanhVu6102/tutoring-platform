const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const Class = require('../models/Class');
const User = require('../models/User');
const ClassSession = require('../models/ClassSession');
const service = require('../utils/classSessions');
const { transaction } = require('../utils/transaction');
const { sessionInput, pagination } = require('../utils/sessionValidation');
const ids = { teacher: 'a'.repeat(24), student: 'b'.repeat(24), class: 'c'.repeat(24), session: 'd'.repeat(24) };
const actor = { id: ids.teacher, role: 'teacher' };
const input = { startsAt: '2026-11-01T09:00:00+07:00', endsAt: '2026-11-01T10:00:00+07:00' };
const cls = { _id: ids.class, teacher: ids.teacher, students: [ids.student], status: 'active' };
const item = { _id: ids.session, class: ids.class, teacher: ids.teacher, status: 'ongoing',
  attendances: [{ student: ids.student, status: 'absent', note: 'private' }, { student: 'e'.repeat(24), status: 'late', note: 'other' }] };
const query = (value) => ({ session() { return this; }, lean: async () => value });

function mockAccess(t, data = item, classData = cls) {
  t.mock.method(ClassSession, 'findById', () => query(data));
  t.mock.method(Class, 'findById', () => query(classData));
}

function mockTransaction(t) {
  const session = { withTransaction: async (fn) => fn(), endSession: t.mock.fn(async () => {}) };
  t.mock.method(mongoose, 'startSession', async () => session);
  return session;
}

test('session validates times, timezone, text and pagination', () => {
  assert.equal(sessionInput(input).startsAt.toISOString(), '2026-11-01T02:00:00.000Z');
  for (const body of [
    { ...input, endsAt: input.startsAt },
    { ...input, startsAt: '2026-11-01T09:00:00' },
    { ...input, startsAt: { $ne: null } },
    { ...input, title: 'x'.repeat(256) },
    { ...input, location: [] },
    { ...input, startsAt: '2026-02-30T09:00:00+07:00' },
    { ...input, startsAt: '2026-11-01T24:00:00Z' },
  ]) assert.throws(() => sessionInput(body), { statusCode: 400 });
  assert.deepEqual(pagination({}), { page: 1, limit: 20 });
  for (const value of ['0', '-1', '1.5', { $gt: 0 }]) {
    assert.throws(() => pagination({ page: value }), { statusCode: 400 });
  }
  assert.throws(() => pagination({ limit: '101' }), { statusCode: 400 });
});

test('session schema rejects duplicate attendance and invalid date ranges', () => {
  const data = { ...input, class: ids.class, teacher: ids.teacher, createdBy: ids.teacher };
  assert.equal(new ClassSession(data).validateSync(), undefined);
  assert.ok(new ClassSession({ ...data, endsAt: input.startsAt }).validateSync());
  assert.ok(new ClassSession({ ...data, attendances: [{ student: ids.student }, { student: ids.student }] }).validateSync());
});

test('creating session locks teacher and class, checks strict overlap and snapshots students', async (t) => {
  const session = mockTransaction(t);
  t.mock.method(Class, 'findById', () => query(cls));
  const locks = [];
  t.mock.method(User, 'findOneAndUpdate', async (filter, update, options) => {
    locks.push('teacher');
    assert.equal(filter._id, cls.teacher);
    assert.equal(update.$inc.scheduleRevision, 1);
    assert.equal(options.session, session);
    return {};
  });
  t.mock.method(Class, 'findOneAndUpdate', async () => { locks.push('class'); return cls; });
  t.mock.method(ClassSession, 'exists', (filter) => {
    assert.deepEqual(locks, ['teacher', 'class']);
    assert.equal(filter.startsAt.$lt.toISOString(), '2026-11-01T03:00:00.000Z');
    assert.equal(filter.endsAt.$gt.toISOString(), '2026-11-01T02:00:00.000Z');
    assert.equal(filter.status.$ne, 'cancelled');
    return { session: async () => null };
  });
  t.mock.method(ClassSession, 'create', async ([data], options) => {
    assert.equal(options.session, session);
    assert.equal(data.teacher, cls.teacher);
    assert.equal(data.createdBy, actor.id);
    assert.deepEqual(data.attendances, [{ student: ids.student, status: 'absent' }]);
    return [data];
  });
  await service.createSession(ids.class, actor, { ...input, teacher: 'untrusted' });
  assert.equal(session.endSession.mock.callCount(), 1);
});

test('overlapping session aborts before creation', async (t) => {
  const session = mockTransaction(t);
  t.mock.method(Class, 'findById', () => query(cls));
  t.mock.method(User, 'findOneAndUpdate', async () => ({}));
  t.mock.method(Class, 'findOneAndUpdate', async () => cls);
  t.mock.method(ClassSession, 'exists', () => ({ session: async () => ({ _id: ids.session }) }));
  t.mock.method(ClassSession, 'create', () => assert.fail('Must not create overlap'));
  await assert.rejects(service.createSession(ids.class, actor, input), { statusCode: 409 });
  assert.equal(session.endSession.mock.callCount(), 1);
});

test('closed classes and unrelated teachers cannot create sessions', async (t) => {
  mockTransaction(t);
  let current = { ...cls, status: 'inactive' };
  t.mock.method(Class, 'findById', () => query(current));
  await assert.rejects(service.createSession(ids.class, actor, input), { statusCode: 409 });
  current = cls;
  await assert.rejects(service.createSession(ids.class, { ...actor, id: 'e'.repeat(24) }, input), { statusCode: 403 });
});

test('standalone MongoDB returns 503 without retrying nontransactionally', async (t) => {
  const endSession = t.mock.fn(async () => {});
  t.mock.method(mongoose, 'startSession', async () => ({
    withTransaction: async () => { throw Object.assign(new Error('standalone'), { code: 20 }); }, endSession,
  }));
  await assert.rejects(transaction(() => assert.fail()), { statusCode: 503 });
  assert.equal(endSession.mock.callCount(), 1);
});

test('student and unrelated teacher cannot take attendance', async (t) => {
  mockAccess(t);
  const body = { student_id: ids.student, status: 'present' };
  await assert.rejects(service.checkIn(ids.session, { id: ids.student, role: 'student' }, body), { statusCode: 403 });
  await assert.rejects(service.checkIn(ids.session, { id: 'e'.repeat(24), role: 'teacher' }, body), { statusCode: 403 });
});

test('attendance requires current membership and session snapshot', async (t) => {
  mockAccess(t, { ...item, attendances: [] });
  await assert.rejects(service.checkIn(ids.session, actor, { student_id: ids.student, status: 'present' }), { statusCode: 409 });
  await assert.rejects(service.checkIn(ids.session, actor, { student_id: 'f'.repeat(24), status: 'present' }), { statusCode: 403 });
  await assert.rejects(service.checkIn(ids.session, actor, { student_id: ids.student, status: 'invalid' }), { statusCode: 400 });
});

test('attendance updates one existing row atomically and clears check-in time for absence', async (t) => {
  mockAccess(t);
  t.mock.method(ClassSession, 'findOneAndUpdate', async (filter, update) => {
    assert.deepEqual(filter.status.$in, ['ongoing', 'completed']);
    assert.equal(filter['attendances.student'], ids.student);
    assert.equal(update.$set['attendances.$.checkedInAt'], null);
    assert.equal(update.$set['attendances.$.recordedBy'], actor.id);
    assert.equal(update.$set['attendances.$.note'], 'reason');
    return item;
  });
  await service.checkIn(ids.session, actor, { student_id: ids.student, status: 'absent', note: ' reason ' });
});

test('cancelled/scheduled sessions cannot be checked in', async (t) => {
  mockAccess(t);
  t.mock.method(ClassSession, 'findOneAndUpdate', async () => null);
  await assert.rejects(service.checkIn(ids.session, actor, { student_id: ids.student, status: 'present' }), { statusCode: 409 });
});

test('status change uses compare-and-set and cannot reopen terminal states', async (t) => {
  mockAccess(t);
  t.mock.method(ClassSession, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter.status, 'ongoing');
    assert.equal(update.$set.status, 'completed');
    return { ...item, status: 'completed' };
  });
  assert.equal((await service.changeStatus(ids.session, actor, 'completed')).status, 'completed');
  await assert.rejects(service.changeStatus(ids.session, actor, 'scheduled'), { statusCode: 409 });
  await assert.rejects(service.changeStatus(ids.session, actor, '__proto__'), { statusCode: 400 });
});

test('completed and cancelled sessions cannot be reopened', async (t) => {
  let status = 'completed';
  t.mock.method(ClassSession, 'findById', () => query({ ...item, status }));
  t.mock.method(Class, 'findById', () => query(cls));
  for (const terminal of ['completed', 'cancelled']) {
    status = terminal;
    await assert.rejects(service.changeStatus(ids.session, actor, 'ongoing'), { statusCode: 409 });
  }
});

test('concurrent status changes report a conflict instead of overwriting', async (t) => {
  mockAccess(t);
  t.mock.method(ClassSession, 'findOneAndUpdate', async () => null);
  await assert.rejects(service.changeStatus(ids.session, actor, 'cancelled'), { statusCode: 409 });
});

test('missing and malformed sessions return 404 and 400', async (t) => {
  mockAccess(t, null);
  await assert.rejects(service.accessibleSession(ids.session, actor), { statusCode: 404 });
  await assert.rejects(service.accessibleSession('invalid', actor), { statusCode: 400 });
});

test('unrelated users cannot read sessions; admins can manage all classes', async (t) => {
  mockAccess(t);
  await assert.rejects(service.accessibleSession(ids.session, { id: 'f'.repeat(24), role: 'student' }), { statusCode: 403 });
  await assert.rejects(service.accessibleSession(ids.session, { id: 'f'.repeat(24), role: 'teacher' }), { statusCode: 403 });
  assert.equal((await service.accessibleSession(ids.session, { id: 'f'.repeat(24), role: 'admin' }, true)).manager, true);
});

test('inactive teacher blocks session creation before any insert', async (t) => {
  mockTransaction(t);
  t.mock.method(Class, 'findById', () => query(cls));
  t.mock.method(User, 'findOneAndUpdate', async () => null);
  t.mock.method(ClassSession, 'create', () => assert.fail('Must not create session'));
  await assert.rejects(service.createSession(ids.class, actor, input), { statusCode: 409 });
});

test('HTTP routes enforce student privacy and manager-only writes', async (t) => {
  mockAccess(t);
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ role: 'student', status: 'active' }) }) }));
  const { classRouter, sessionRouter } = require('../routes/sessions');
  const app = express();
  app.use(express.json());
  app.use('/api/classes', classRouter);
  app.use('/api/sessions', sessionRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ userId: ids.student, role: 'admin' }, process.env.JWT_SECRET || 'your-secret-key');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const result = await fetch(`${base}/api/sessions/${ids.session}/attendances`, { headers });
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).items, [{ student: ids.student, status: 'absent' }]);
  const detail = await fetch(`${base}/api/sessions/${ids.session}`, { headers });
  assert.equal((await detail.json()).attendances, undefined);
  const denied = await fetch(`${base}/api/sessions/${ids.session}/check-in`, { method: 'POST', headers, body: '{}' });
  assert.equal(denied.status, 403);
  const invalid = await fetch(`${base}/api/classes/${ids.class}/sessions?page=0`, { headers });
  assert.equal(invalid.status, 400);
  const noToken = await fetch(`${base}/api/sessions/${ids.session}`);
  assert.equal(noToken.status, 401);
});
