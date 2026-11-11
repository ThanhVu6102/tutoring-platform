const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, fork } = require('node:child_process');
const { promisify } = require('node:util');
const mongoose = require('mongoose');
const { createLab } = require('./lib/isolated-mongo');
const lab = require('./lib/performance-lab');
const exec = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const before = 'f46880307bb769b5a347736bf60c7e3f04d22f4b';
const after = 'c9aca1771552d8d372bbf2222801c9a16ffc2505';

async function snapshot(commit, folder, workingTree = false) {
  const resolved = (await exec('git', ['rev-parse', `${commit}^{commit}`], { cwd: root })).stdout.trim();
  if (resolved !== commit) throw new Error('Snapshot commit không khớp');
  const files = (await exec('git', ['ls-tree', '-r', '--name-only', commit, '--',
    'backend/routes', 'backend/models', 'backend/utils', 'backend/middleware', 'backend/config'], { cwd: root })).stdout.trim().split(/\r?\n/);
  const hashes = {};
  for (const file of files) {
    if (!/^backend\/(routes|models|utils|middleware|config)\/[\w/.-]+\.js$/.test(file) || file.split('/').includes('..')) {
      throw new Error('File snapshot ngoài allowlist');
    }
    const content = workingTree ? fs.readFileSync(path.join(root, file))
      : (await exec('git', ['show', `${commit}:${file}`], { cwd: root, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })).stdout;
    const destination = path.join(folder, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content, { flag: 'wx' });
    hashes[file] = crypto.createHash('sha256').update(content).digest('hex');
  }
  return { commit, ...(workingTree ? { source: 'working-tree tracked application files; hashes are authoritative, not committed revision' } : {}), files: hashes };
}

function worker() {
  // Không truyền .env, Mongo URI, token hoặc cấu hình ứng dụng của máy vào worker.
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'TEMP', 'TMP'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  env.NODE_PATH = path.join(root, 'backend/node_modules');
  const child = fork(path.join(__dirname, 'lib/performance-code-worker.js'), [], { env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let sequence = 0;
  const call = (message) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => finish(new Error('Worker timeout')), 60000);
    const onExit = () => finish(new Error('Worker exited'));
    const onMessage = (result) => {
      if (message.type !== 'init' && result.id !== id) return;
      if (result.type === 'error') finish(new Error(`Worker failed: ${result.stage}/${result.name || 'error'}`));
      else finish(null, result);
    };
    function finish(error, result) {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      if (error) reject(error); else resolve(result);
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
    child.send({ ...message, id }, (error) => { if (error) finish(error); });
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => child.kill(), 10000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      if (child.connected) child.send({ type: 'stop' }); else child.kill();
    });
  };
  return { call, stop };
}

async function main(args = process.argv.slice(2)) {
  const candidate = args.includes('--candidate');
  if (args.filter((arg) => arg === '--candidate').length > 1) throw new Error('Duplicate --candidate');
  const config = lab.options(args.filter((arg) => arg !== '--candidate'));
  const revisions = { before: candidate ? after : before, after };
  // Runner code chỉ seed user/lớp; ghi đúng cấu hình thực tế, không báo cảnh báo/học liệu giả không dùng.
  config.warnings = 0;
  config.items = 1;
  if (config.compareWarningIndexes) throw new Error('Dùng perf:lab cho thí nghiệm index');
  if (!config.run) {
    console.log(JSON.stringify({ mode: 'dry-run', ...revisions, candidate, config,
      note: 'Snapshot code thật, cùng dữ liệu/index; thêm --run để tạo Docker local.' }, null, 2));
    return;
  }
  const tempBase = path.join(process.env.LOCALAPPDATA, 'Temp/opencode');
  const folder = fs.mkdtempSync(path.join(tempBase, 'be04-code-'));
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: 'running', config,
    environment: { node: process.version, cpus: 2, memoryMiB: 1024, compression: 'identity',
      layer: 'local Express + MongoDB; not Vercel, concurrent load or cold database',
      method: 'same physical dataset/indexes; alternating ABBA warm HTTP trials; EXPLAIN outside timer' },
    provenance: {}, workloads: [], cleanup: {} };
  const workers = [];
  let resource;
  let failure;
  try {
    report.stage = 'snapshots';
    for (const [name, commit] of Object.entries(revisions)) {
      report.provenance[name] = await snapshot(commit, path.join(folder, name), candidate && name === 'after');
    }
    report.stage = 'container';
    resource = await createLab();
    report.environment.image = resource.image;
    report.runId = resource.id;
    report.stage = 'seed';
    const fixture = lab.fixtures(mongoose, { ...config, warnings: 0 });
    const db = resource.client.db(resource.database);
    report.dataset = {};
    report.indexes = {};
    // Chỉ seed hai collection cần đo; cùng index vật lý của main cho cả hai snapshot.
    for (const name of ['User', 'Class']) {
      const model = require(`../models/${name}`);
      const collection = db.collection(model.collection.name);
      await collection.insertMany(fixture.data[name]);
      for (const [key, options] of model.schema.indexes()) await collection.createIndex(key, options);
      report.dataset[name] = fixture.data[name].length;
      report.indexes[name] = (await collection.indexes()).map(({ name: indexName, key }) => ({ name: indexName, key }));
    }
    report.stage = 'workers';
    const versions = {};
    const secret = crypto.randomBytes(32).toString('hex');
    for (const version of ['before', 'after']) {
      const instance = worker();
      workers.push(instance);
      await instance.call({ type: 'init', sourceRoot: path.join(folder, version), uri: resource.uri, dbName: resource.database, secret });
      versions[version] = instance;
    }
    const workloads = [
      { name: 'classes_admin_first', role: 'admin', path: '/api/classes?page=1&limit=20', comparison: 'old ignores pagination; all rows vs first page' },
      { name: 'classes_teacher_first', role: 'teacher', path: '/api/classes?page=1&limit=20', comparison: 'same role scope; compare actual rows (default fixture has 20 per teacher)' },
      { name: 'classes_student_first', role: 'student', path: '/api/classes?page=1&limit=20', comparison: 'same role scope; compare actual returnedRows' },
      { name: 'users_admin_first', role: 'admin', path: '/api/users?page=1&limit=20', comparison: 'equal 20 rows; projection/query implementation differs' },
      { name: 'users_admin_deep', role: 'admin', path: `/api/users?page=${Math.max(1, Math.ceil(config.users * .75 / 20))}&limit=20`, comparison: 'equal deep-page rows; compare exact totals' },
      { name: 'users_admin_default', role: 'admin', path: '/api/users', comparison: 'old unbounded vs new default first page' },
    ];
    if (candidate) {
      for (const workload of workloads) workload.comparison = 'main vs working-tree candidate; same rows, scope and physical indexes';
      for (const [name, query] of [
        ['classes_summary', 'summary=true'], ['classes_q_rare', 'q=000001'],
        ['classes_q_broad', 'q=Fixture'], ['classes_q_summary', 'q=Fixture&summary=true'],
        ['classes_q_empty', 'q=not-found'], ['classes_history', 'view=history'],
        ['classes_q_history_summary', 'q=Fixture&view=history&summary=true'],
      ]) workloads.push({ name, role: 'admin', path: `/api/classes?page=1&limit=20&${query}`,
        comparison: 'main vs working-tree candidate; identical filter/rows/totals' });
    }
    for (const workload of workloads) {
      report.stage = workload.name;
      const result = { ...workload, before: { trials: [] }, after: { trials: [] } };
      report.workloads.push(result);
      const measure = (version, explain = false) => versions[version].call({ type: 'measure', role: workload.role,
        actorId: String(fixture[workload.role]._id), path: workload.path, explain });
      for (const version of ['before', 'after']) result[version].first = await measure(version, true);
      // Mỗi block ABBA có hai mẫu mỗi phiên bản, không chạy đồng thời gây tranh CPU.
      for (let block = 0; block < Math.ceil(config.samples / 2); block++) {
        for (const version of ['before', 'after', 'after', 'before']) {
          result[version].trials.push(await measure(version));
        }
      }
      for (const version of ['before', 'after']) {
        result[version].warmMs = lab.statistics(result[version].trials.map((trial) => trial.durationMs));
        const first = result[version].first;
        if (result[version].trials.some((trial) => trial.returnedRows !== first.returnedRows || trial.total !== first.total || trial.decodedBytes !== first.decodedBytes)) {
          throw new Error('Response thay đổi giữa các mẫu');
        }
      }
      if (result.before.first.total !== result.after.first.total) throw new Error('Phạm vi hoặc tổng trước/sau khác nhau');
      if (result.before.first.returnedRows === result.after.first.returnedRows &&
          result.before.first.rowIdDigest !== result.after.first.rowIdDigest) throw new Error('Cùng số dòng nhưng ID khác nhau');
      if (candidate && result.before.first.bodyDigest !== result.after.first.bodyDigest) throw new Error('JSON response candidate khác baseline main');
      console.log(`${workload.name}: ${result.before.warmMs.median.toFixed(2)} -> ${result.after.warmMs.median.toFixed(2)} ms`);
    }
    // Bộ lọc mới không tồn tại ở code cũ: chỉ ghi plan/current result, không giả làm so sánh tương đương.
    report.filterPlans = [];
    for (const query of ['subject=Math&grade=10&status=active', `teacher=${fixture.teacher._id}`,
      `teacher=${encodeURIComponent(fixture.teacher.email)}`, 'sort=name_asc', 'sort=name_desc',
      'q=000001', 'q=000001&view=history', 'status=inactive&summary=true']) {
      const measurement = await versions.after.call({ type: 'measure', role: 'admin', actorId: String(fixture.admin._id),
        path: `/api/classes?page=1&limit=20&${query}`, explain: true });
      report.filterPlans.push({ name: query.startsWith('teacher=') ? (query.includes('%40') ? 'teacher_email' : 'teacher_id') : query, measurement });
    }
    report.status = 'completed';
  } catch (error) {
    failure = error;
    report.status = 'failed';
    report.failure = { stage: report.stage, name: error.name };
    // Chỉ lỗi nội bộ runner có thông điệp ngắn; không in exception từ MongoDB.
    console.error(`Code lab failed at ${report.stage}`);
  } finally {
    for (const instance of workers) await instance.stop();
    try { if (resource) report.cleanup = await resource.cleanup(); }
    catch { report.cleanup.failed = true; report.status = 'failed'; }
    // Chỉ xóa folder ngẫu nhiên do chính runner tạo, không đụng worktree hay file người dùng.
    fs.rmSync(folder, { recursive: true });
    report.cleanup.snapshotsRemoved = true;
  }
  report.finishedAt = new Date().toISOString();
  const output = path.join(root, 'docs/local/performance', `code-${resource?.id || crypto.randomBytes(12).toString('hex')}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(`Report local: ${path.relative(root, output)}; status: ${report.status}`);
  if (failure || report.status !== 'completed') throw new Error('Benchmark chưa hoàn tất; không dùng report lỗi để nghiệm thu');
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
