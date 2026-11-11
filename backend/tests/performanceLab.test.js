const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const lab = require('../scripts/lib/performance-lab');

// Test guard không cần Docker/DB và không thay đổi các biến môi trường bí mật.
test('performance lab is dry-run by default and refuses external connection arguments', () => {
  assert.equal(lab.options([]).run, false);
  assert.deepEqual(lab.options(['--run', '--users', '100', '--classes', '20', '--warnings', '0', '--samples', '3']),
    { run: true, compareWarningIndexes: false, users: 100, classes: 20, warnings: 0, items: 3, samples: 3 });
  assert.equal(lab.options(['--compare-warning-indexes']).compareWarningIndexes, true);
  for (const args of [['--uri', 'mongodb://example.invalid'], ['--database', 'production'],
    ['--token', 'not-allowed'], ['users', '100'], ['--users', '0'], ['--samples', '2'],
    ['--classes', '5000', '--items', '10'], ['--users', '2.5'], ['--unknown']]) {
    assert.throws(() => lab.options(args));
  }
});

test('cleanup guards require both generated names and labels of the exact run', () => {
  const names = lab.resourceNames('a'.repeat(24));
  const labels = { 'tutoring.lab': 'be04', 'tutoring.run': names.id };
  assert.doesNotThrow(() => lab.assertOwner(labels, names));
  assert.doesNotThrow(() => lab.assertDatabase(names.database, names));
  assert.throws(() => lab.assertOwner({ ...labels, 'tutoring.run': 'b'.repeat(24) }, names));
  assert.throws(() => lab.assertOwner(labels, { ...names, container: 'existing-user-container' }));
  assert.throws(() => lab.assertDatabase('tutoring-platform', names));
  assert.throws(() => lab.assertDatabase(`perf_lab_${'b'.repeat(24)}`, names));
  assert.throws(() => lab.resourceNames('../unsafe'));
});

test('latency summaries compute median/p95 without altering the input', () => {
  const values = [40, 10, 30, 20];
  assert.deepEqual(lab.statistics(values), { samples: 4, median: 25, p95: 40, min: 10, max: 40 });
  assert.deepEqual(values, [40, 10, 30, 20]);
  assert.throws(() => lab.statistics([]));
  assert.throws(() => lab.statistics([NaN]));
});

test('ABBA phases preserve the original index experiment when comparison is disabled', () => {
  assert.deepEqual(lab.phases(true).map((phase) => phase.candidate), [false, true, true, false]);
  assert.deepEqual(lab.phases(false).map((phase) => phase.name), ['without_secondary_indexes', 'schema_indexes']);
  assert.equal(lab.isWarningCandidate({ status: 1, appealDeadline: 1 }), true);
  assert.equal(lab.isWarningCandidate({ student: 1, class: 1, status: 1 }), false);
});

test('ABBA creates or drops only known warning indexes in the exact owned database', async () => {
  const names = lab.resourceNames('a'.repeat(24));
  let created;
  const dropped = [];
  const collection = { collectionName: 'studentwarnings',
    indexes: async () => [{ name: '_id_', key: { _id: 1 } },
      { name: 'issuedAt_-1__id_-1', key: { issuedAt: -1, _id: -1 } },
      { name: 'unrelated_index', key: { class: 1 } }],
    createIndexes: async (specs) => { created = specs; },
    dropIndex: async (name) => { dropped.push(name); } };
  await assert.rejects(lab.setWarningIndexes(collection, 'production', names, false));
  await assert.rejects(lab.setWarningIndexes({ ...collection, collectionName: 'users' }, names.database, names, false));
  assert.deepEqual(dropped, []);
  await lab.setWarningIndexes(collection, names.database, names, false);
  assert.deepEqual(dropped, ['issuedAt_-1__id_-1']);
  await lab.setWarningIndexes(collection, names.database, names, true);
  assert.equal(created.length, 3);
  assert.ok(created.every((spec) => lab.isWarningCandidate(spec.key)));
  await assert.rejects(lab.setWarningIndexes({ ...collection,
    indexes: async () => [{ name: 'issuedAt_-1__id_-1', key: { privateField: 1 } }],
  }, names.database, names, false));
  assert.deepEqual(dropped, ['issuedAt_-1__id_-1']);
});

test('command normalization keeps the actual find/aggregate but excludes connection metadata and writes', () => {
  const filter = { teacher: new mongoose.Types.ObjectId() };
  const command = lab.explainableCommand({ commandName: 'find', command: {
    find: 'classes', filter, sort: { createdAt: -1 }, limit: 20, lsid: 'private', $db: 'test-db' } });
  assert.deepEqual(command, { find: 'classes', filter, sort: { createdAt: -1 }, limit: 20 });
  assert.equal(command.filter, filter);
  assert.equal(lab.explainableCommand({ commandName: 'insert', command: {} }), null);
  assert.equal(lab.explainableCommand({ commandName: 'aggregate', command: { pipeline: [{ $out: 'elsewhere' }] } }), null);
  assert.equal(lab.explainableCommand({ commandName: 'aggregate', command: { pipeline: [{ $merge: 'elsewhere' }] } }), null);
  const aggregate = { aggregate: 'classes', pipeline: [{ $match: filter }, { $limit: 20 }], cursor: {} };
  assert.deepEqual(lab.explainableCommand({ commandName: 'aggregate', command: aggregate }), aggregate);
});

test('plan analysis only considers winning execution, not rejected collection scans', () => {
  const result = lab.planSummary({ queryPlanner: { winningPlan: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: 'teacher_1' } },
    rejectedPlans: [{ stage: 'COLLSCAN' }] }, executionStats: { nReturned: 20, totalDocsExamined: 20, totalKeysExamined: 20 } });
  assert.equal(result.collectionScan, false);
  assert.deepEqual(result.indexes, ['teacher_1']);
  assert.equal(result.totalDocsExamined, 20);
  const aggregate = lab.planSummary({ stages: [{ $cursor: { queryPlanner: { winningPlan: { stage: 'COLLSCAN' } },
    executionStats: { totalDocsExamined: 1000 } } }, { $sort: { sortKey: { createdAt: -1 } } }] });
  assert.equal(aggregate.collectionScan, true);
  assert.equal(aggregate.blockingSort, true);
  assert.equal(aggregate.statisticsScope, 'aggregation_cursor');
});

test('fixture has only synthetic users, valid role relationships and no expired pending warnings', () => {
  const fixture = lab.fixtures(mongoose, { users: 100, classes: 20, warnings: 40, items: 2 });
  assert.equal(fixture.data.User.length, 100);
  assert.equal(fixture.data.Class.length, 20);
  assert.equal(fixture.data.Video.length, 40);
  assert.equal(fixture.data.StudentWarning.length, 40);
  assert.equal(fixture.admin.role, 'admin');
  assert.equal(fixture.teacher.role, 'teacher');
  assert.equal(fixture.student.role, 'student');
  assert.equal(String(fixture.cls.teacher), String(fixture.teacher._id));
  assert.ok(fixture.cls.students.some((id) => String(id) === String(fixture.student._id)));
  assert.ok(fixture.data.User.every((user) => user.email.endsWith('@example.test')));
  assert.ok(fixture.data.StudentWarning.filter((warning) => warning.status === 'pending')
    .every((warning) => warning.appealDeadline > new Date()));
});
