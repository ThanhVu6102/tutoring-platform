const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFile, fork } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const runner = path.resolve(__dirname, '../scripts/performance-code-lab.js');
const worker = path.resolve(__dirname, '../scripts/lib/performance-code-worker.js');

// Các kiểm tra guard này không tạo Docker, kết nối DB hoặc nạp .env ứng dụng.
test('code benchmark defaults to dry-run with exact snapshots and refuses external arguments', async () => {
  const result = JSON.parse((await exec(process.execPath, [runner])).stdout);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.config.run, false);
  assert.equal(result.before, 'f46880307bb769b5a347736bf60c7e3f04d22f4b');
  assert.equal(result.after, 'c9aca1771552d8d372bbf2222801c9a16ffc2505');
  assert.equal(result.config.warnings, 0);
  const candidate = JSON.parse((await exec(process.execPath, [runner, '--candidate'])).stdout);
  assert.equal(candidate.candidate, true);
  assert.equal(candidate.before, result.after);
  assert.equal(candidate.after, result.after);
  for (const args of [['--uri', 'mongodb://outside'], ['--samples', '0'], ['--compare-warning-indexes']]) {
    await assert.rejects(exec(process.execPath, [runner, ...args]));
  }
});

test('snapshot worker rejects unsafe initialization without exposing input in logs', { timeout: 20000 }, async (t) => {
  const child = fork(worker, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const call = (message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IPC timeout')), 5000);
    child.once('message', (result) => { clearTimeout(timer); resolve(result); });
    child.send(message);
  });
  const valid = { type: 'init', sourceRoot: path.dirname(runner),
    uri: 'mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=perf-rs',
    dbName: `perf_code_${'a'.repeat(24)}`, secret: 'b'.repeat(64) };
  for (const override of [
    { sourceRoot: 'relative/path' }, { uri: 'mongodb://outside.invalid/?secret=do-not-log' },
    { dbName: 'production' }, { secret: 'do-not-log' },
  ]) {
    const result = await call({ ...valid, ...override });
    assert.equal(result.type, 'error');
    assert.equal(result.stage, 'init');
    assert.equal(result.name, 'Error');
    assert.equal(result.message, undefined);
  }
  const result = await call({ type: 'measure', id: 1, path: 'https://outside.invalid/do-not-log', actorId: 'a'.repeat(24), role: 'admin' });
  assert.equal(result.type, 'error');
  assert.equal(result.stage, 'measure');
  assert.equal(output, '');
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.send({ type: 'stop' });
  await exited;
});
