const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: pause } = require('node:timers/promises');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const lab = require('./lib/performance-lab');
const exec = promisify(execFile);
const image = 'mongo:7.0.45';

async function docker(args, timeout = 30000) {
  return (await exec('docker', args, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 })).stdout.trim();
}

// Script không đọc .env, MONGODB_URI, BENCH_TOKEN hoặc import server.js. URI được
// dựng từ port loopback của container do chính lần chạy tạo, không nhận URI ngoài.
async function main(args = process.argv.slice(2)) {
  const config = lab.options(args);
  if (!config.run) {
    console.log(JSON.stringify({ mode: 'dry-run', config, image,
      note: 'Thêm --run để tạo lab Docker local. Không dùng database/secret hiện có.' }, null, 2));
    return;
  }
  try { await docker(['info', '--format', '{{.ServerVersion}}'], 15000); }
  catch { throw new Error('Docker Desktop chưa sẵn sàng; chưa tạo hoặc ghi database'); }

  const names = lab.resourceNames();
  const cancellation = new AbortController();
  const stop = () => cancellation.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const previousSecret = process.env.JWT_SECRET;
  const previousLogging = process.env.PERF_LOG_ENABLED;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.PERF_LOG_ENABLED = 'false';
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), config,
    environment: { image, node: process.version, cpus: 2, memoryMiB: 1024,
      layer: 'local Express routers + real MongoDB; no Vercel/bootstrap/CDN',
      dataset: 'synthetic-only; no expired pending warnings; not a login/business-rule benchmark',
      logging: false },
    resources: { container: names.container, database: names.database },
    phases: [], cleanup: {}, status: 'running' };
  let containerAttempted = false;
  let setupClient;
  let server;
  let failure;
  let capture;
  const modelNames = ['User', 'Class', 'Video', 'Document', 'Assignment', 'Announcement', 'Quiz', 'StudentWarning'];
  const checkCancelled = () => { if (cancellation.signal.aborted) throw new Error('Đã hủy lab'); };
  try {
    report.sourceCommit = (await exec('git', ['rev-parse', 'HEAD'], { cwd: path.join(__dirname, '../..') })).stdout.trim();
    try {
      await exec('git', ['diff', '--exit-code', '--', 'backend/routes', 'backend/models', 'backend/utils',
        'backend/middleware', 'backend/server.js', 'frontend/src'], { cwd: path.join(__dirname, '../..') });
      report.applicationHasTrackedChanges = false;
    } catch { report.applicationHasTrackedChanges = true; }
    report.stage = 'container';
    containerAttempted = true;
    await docker(['run', '--detach', '--name', names.container,
      '--label', 'tutoring.lab=be04', '--label', `tutoring.run=${names.id}`,
      '--publish', '127.0.0.1::27017', '--memory', '1g', '--cpus', '2',
      '--tmpfs', '/data/db:rw,size=768m', '--tmpfs', '/data/configdb:rw,size=64m',
      image, 'mongod', '--replSet', 'perf-rs', '--bind_ip_all', '--wiredTigerCacheSizeGB', '0.25'], 180000);
    const labels = JSON.parse(await docker(['inspect', '--format', '{{json .Config.Labels}}', names.container]));
    lab.assertOwner(labels, names);
    const address = await docker(['port', names.container, '27017/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('Port Docker không phải loopback riêng');
    const uri = `mongodb://${address}/?directConnection=true`;
    report.stage = 'replica-set';
    const readyDeadline = Date.now() + 60000;
    while (!setupClient) {
      checkCancelled();
      const client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 1000, socketTimeoutMS: 30000 });
      try { await client.connect(); setupClient = client; }
      catch {
        await client.close();
        if (Date.now() >= readyDeadline) throw new Error('MongoDB test không khởi động đúng hạn');
        await pause(300, undefined, { signal: cancellation.signal });
      }
    }
    await setupClient.db('admin').command({ replSetInitiate: { _id: 'perf-rs',
      members: [{ _id: 0, host: '127.0.0.1:27017' }] } });
    while (!(await setupClient.db('admin').command({ hello: 1 })).isWritablePrimary) {
      checkCancelled();
      if (Date.now() >= readyDeadline) throw new Error('Replica set test không có primary đúng hạn');
      await pause(300, undefined, { signal: cancellation.signal });
    }
    mongoose.set('autoIndex', false);
    mongoose.set('autoCreate', false);
    mongoose.set('strictQuery', true);
    await mongoose.connect(`${uri}&replicaSet=perf-rs`, { dbName: names.database,
      autoIndex: false, autoCreate: false, monitorCommands: true, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 30000 });
    lab.assertDatabase(mongoose.connection.name, names);
    const models = Object.fromEntries(modelNames.map((name) => [name, require(`../models/${name}`)]));
    const fixture = lab.fixtures(mongoose, config);
    report.stage = 'seed';
    report.dataset = {};
    for (const [name, rows] of Object.entries(fixture.data)) {
      checkCancelled();
      await mongoose.connection.db.createCollection(models[name].collection.name);
      for (let offset = 0; offset < rows.length; offset += 500) {
        checkCancelled();
        await models[name].collection.insertMany(rows.slice(offset, offset + 500));
      }
      report.dataset[name] = rows.length;
    }

    const writes = new Set(['insert', 'update', 'delete', 'findAndModify', 'drop', 'dropDatabase', 'createIndexes']);
    mongoose.connection.getClient().on('commandStarted', (event) => {
      if (!capture || event.databaseName !== names.database) return;
      capture.commandCount++;
      if (writes.has(event.commandName)) capture.writeCommands++;
      const command = lab.explainableCommand(event);
      if (!command) return;
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify(command)).digest('hex');
      if (capture.commands.size < 200 || capture.commands.has(fingerprint)) capture.commands.set(fingerprint, command);
      else capture.truncated = true;
    });

    const app = express();
    app.use(express.json());
    app.use('/api', require('../middleware/apiPerformance'));
    for (const route of ['classes', 'users', 'videos', 'documents', 'assignments', 'announcements', 'quizzes', 'studentWarnings', 'moderation']) {
      app.use(`/api/${route === 'studentWarnings' ? 'student-warnings' : route}`, require(`../routes/${route}`));
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const tokens = Object.fromEntries(['admin', 'teacher', 'student'].map((role) => [role,
      jwt.sign({ userId: String(fixture[role]._id), role }, process.env.JWT_SECRET, { expiresIn: '1h' })]));

    async function request(role, route, metrics) {
      checkCancelled();
      const response = await fetch(`${base}${route}`, { headers: { Authorization: `Bearer ${tokens[role]}` },
        signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(30000)]) });
      const body = await response.arrayBuffer();
      metrics.requests++;
      metrics.bytes += body.byteLength;
      metrics.encodings.add(response.headers.get('content-encoding') || 'none');
      if (!response.ok) throw new Error(`Workload trả HTTP ${response.status}`);
      return JSON.parse(Buffer.from(body).toString('utf8'));
    }
    async function allPages(route, metrics) {
      const first = await request('admin', `${route}&page=1&limit=100`, metrics);
      for (let page = 2; page <= first.totalPages; page += 1) {
        await request('admin', `${route}&page=${page}&limit=100`, metrics);
      }
    }
    const classPath = String(fixture.cls._id);
    const workloads = [
      { name: 'classes_admin_first', role: 'admin', path: '/api/classes?page=1&limit=20' },
      { name: 'classes_admin_summary', role: 'admin', path: '/api/classes?page=1&limit=20&summary=true' },
      { name: 'classes_admin_deep', role: 'admin', path: `/api/classes?page=${Math.max(1, Math.ceil(config.classes * .75 / 20))}&limit=20` },
      { name: 'classes_admin_search', role: 'admin', path: '/api/classes?search=Class%200001&limit=20' },
      { name: 'classes_teacher', role: 'teacher', path: '/api/classes?limit=20' },
      { name: 'classes_student', role: 'student', path: '/api/classes?limit=20' },
      { name: 'users_admin_first', role: 'admin', path: '/api/users?page=1&limit=20' },
      { name: 'users_admin_deep', role: 'admin', path: `/api/users?page=${Math.max(1, Math.ceil(config.users * .75 / 20))}&limit=20` },
      { name: 'users_admin_moderation', role: 'admin', path: '/api/users?role=student&view=moderation&limit=20' },
      ...['videos', 'documents', 'assignments', 'announcements', 'quizzes'].map((resource) => ({
        name: `${resource}_student`, role: 'student', path: `/api/${resource}/class/${classPath}?limit=20` })),
      { name: 'overview_student', role: 'student', path: `/api/classes/${classPath}/content-summary` },
      { name: 'warnings_student', role: 'student', path: '/api/student-warnings/mine' },
      { name: 'warnings_admin', role: 'admin', path: '/api/student-warnings' },
      { name: 'moderation_bootstrap_all_pages', group: true },
      { name: 'moderation_students_page', role: 'admin', path: '/api/moderation/students?page=1&limit=20' },
      { name: 'moderation_classes_page', role: 'admin', path: '/api/moderation/classes?page=1&limit=20' },
      { name: 'moderation_bootstrap_paged', group: true, paged: true },
    ];
    // A/B dùng cùng DB/dataset, chỉ bật/tắt đúng ba index cảnh báo. Mọi index
    // khác luôn giữ nguyên; không thay handler hoặc thứ tự dữ liệu giữa các pha.
    if (config.compareWarningIndexes) {
      for (const [name, model] of Object.entries(models)) {
        if (name !== 'StudentWarning') await model.createIndexes();
        else {
          const originalIndexes = model.schema.indexes().filter(([keys]) => !lab.isWarningCandidate(keys));
          for (const [keys, options] of originalIndexes) await model.collection.createIndex(keys, options);
        }
      }
    }
    for (const phaseConfig of lab.phases(config.compareWarningIndexes)) {
      const phaseName = phaseConfig.name;
      checkCancelled();
      report.stage = phaseName;
      if (config.compareWarningIndexes) {
        const labels = JSON.parse(await docker(['inspect', '--format', '{{json .Config.Labels}}', names.container]));
        lab.assertOwner(labels, names);
        await lab.setWarningIndexes(models.StudentWarning.collection, mongoose.connection.name, names, phaseConfig.candidate);
      } else if (phaseName === 'schema_indexes') {
        for (const model of Object.values(models)) await model.createIndexes();
      }
      const phase = { name: phaseName, ...(config.compareWarningIndexes ? { candidateWarningIndexes: phaseConfig.candidate } : {}),
        workloads: [], indexes: {} };
      report.phases.push(phase);
      for (const [name, model] of Object.entries(models)) {
        phase.indexes[name] = (await model.collection.indexes()).map((index) => ({ name: index.name, key: index.key }));
      }
      for (const workload of workloads) {
        checkCancelled();
        const traces = { commandCount: 0, writeCommands: 0, commands: new Map(), truncated: false };
        const trials = [];
        const count = workload.group ? Math.min(config.samples, 5) : config.samples;
        for (let i = 0; i <= count; i += 1) {
          const metrics = { requests: 0, bytes: 0, encodings: new Set() };
          capture = i === 0 ? traces : null;
          const started = performance.now();
          if (workload.paged) {
            // Cùng dataset/route/auth với legacy; mô phỏng đúng hai GET khi mở tab đầu.
            await Promise.all([request('admin', '/api/moderation/summary', metrics),
              request('admin', '/api/moderation/warnings?page=1&limit=20', metrics)]);
          } else if (workload.group) {
            await Promise.all([allPages('/api/classes?view=history', metrics),
              allPages('/api/users?role=student&view=moderation', metrics),
              request('admin', '/api/student-warnings', metrics)]);
          } else await request(workload.role, workload.path, metrics);
          capture = null;
          trials.push({ durationMs: performance.now() - started, requests: metrics.requests,
            bytes: metrics.bytes, contentEncoding: [...metrics.encodings] });
        }
        if (traces.writeCommands) throw new Error('Workload đọc phát sinh ghi dữ liệu; dừng để giữ baseline đúng');
        const plans = [];
        for (const [fingerprint, command] of traces.commands) {
          checkCancelled();
          const explanation = await mongoose.connection.db.command({ explain: { ...command, maxTimeMS: 30000 }, verbosity: 'executionStats' });
          plans.push({ fingerprint: fingerprint.slice(0, 16), operation: command.find ? 'find' : 'aggregate',
            collection: command.find || command.aggregate, ...lab.planSummary(explanation) });
        }
        const warm = trials.slice(1);
        const result = { name: workload.name, role: workload.role || 'admin',
           firstRequestMs: trials[0].durationMs, warmMs: lab.statistics(warm.map((trial) => trial.durationMs)),
           ...(config.compareWarningIndexes ? { warmTrials: warm } : {}),
          requestsPerTrial: warm.map((trial) => trial.requests),
          averageDecodedBytes: warm.reduce((sum, trial) => sum + trial.bytes, 0) / warm.length,
          contentEncoding: [...new Set(trials.flatMap((trial) => trial.contentEncoding))],
          tracedCommandCount: traces.commandCount, traceTruncated: traces.truncated, plans };
        phase.workloads.push(result);
        console.log(`${phaseName}: ${workload.name}: median ${result.warmMs.median.toFixed(2)} ms`);
      }
    }
    report.status = 'completed';
  } catch (error) {
    failure = error;
    report.status = 'failed';
    // Không ghi exception message/stack vì thư viện có thể kèm URI, command hoặc body.
    report.failure = { stage: report.stage, name: error.name, code: error.code };
  } finally {
    capture = null;
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      if (mongoose.connection.readyState === 1) {
        lab.assertDatabase(mongoose.connection.name, names);
        await mongoose.connection.dropDatabase();
        report.cleanup.databaseDropped = true;
      }
    } catch { report.cleanup.databaseDropped = false; }
    try { await mongoose.disconnect(); report.cleanup.clientClosed = true; }
    catch { report.cleanup.clientClosed = false; }
    if (setupClient) { try { await setupClient.close(); } catch { report.cleanup.clientClosed = false; } }
    if (containerAttempted) {
      try {
        const labels = JSON.parse(await docker(['inspect', '--format', '{{json .Config.Labels}}', names.container]));
        lab.assertOwner(labels, names);
        await docker(['rm', '--force', '--volumes', names.container]);
        report.cleanup.containerRemoved = true;
      } catch { report.cleanup.containerRemoved = false; }
    }
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousLogging === undefined) delete process.env.PERF_LOG_ENABLED;
    else process.env.PERF_LOG_ENABLED = previousLogging;
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  report.finishedAt = new Date().toISOString();
  if (!report.cleanup.containerRemoved) { report.status = 'failed'; failure ||= new Error('Cần kiểm tra dọn container lab'); }
  const folder = path.join(__dirname, '../../docs/local/performance');
  fs.mkdirSync(folder, { recursive: true });
  const output = path.join(folder, `${names.id}.json`);
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
  console.log(`Report local: ${path.relative(path.join(__dirname, '../..'), output)}`);
  console.log(`Status: ${report.status}; cleanup container: ${Boolean(report.cleanup.containerRemoved)}`);
  if (failure) throw new Error('Lab chưa hoàn tất; xem stage và cleanup trong report local, không dùng kết quả lỗi làm bằng chứng');
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
