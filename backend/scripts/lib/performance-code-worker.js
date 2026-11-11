const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const { explainableCommand, planSummary } = require('./performance-lab');
let server;
let database;
let secret;
let base;
let capture;
let initialized = false;
let busy = false;
const send = (data) => { if (process.connected) process.send(data); };

// Không để thư viện/router in query, body, URI hoặc JWT ra log benchmark.
console.log = console.error = console.warn = () => {};
async function stop() {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  await mongoose.disconnect();
}
async function init(message) {
  if (initialized || !path.isAbsolute(message.sourceRoot || '') ||
      !/^mongodb:\/\/127\.0\.0\.1:\d+\/\?directConnection=true&replicaSet=perf-rs$/.test(message.uri || '') ||
      !/^perf_code_[a-f\d]{24}$/.test(message.dbName || '') || !/^[a-f\d]{64}$/.test(message.secret || '')) {
    throw new Error('Invalid init');
  }
  initialized = true;
  database = message.dbName;
  secret = message.secret;
  process.env.JWT_SECRET = secret;
  process.env.PERF_LOG_ENABLED = 'false';
  mongoose.set('strictQuery', true);
  mongoose.set('autoCreate', false);
  mongoose.set('autoIndex', false);
  await mongoose.connect(message.uri, { dbName: database, autoIndex: false, autoCreate: false,
    monitorCommands: true, serverSelectionTimeoutMS: 15000, socketTimeoutMS: 30000 });
  mongoose.connection.getClient().on('commandStarted', (event) => {
    if (!capture || event.databaseName !== database) return;
    capture.commandCount++;
    if (!['find', 'aggregate', 'getMore', 'killCursors'].includes(event.commandName)) capture.writingCommandCount++;
    const command = explainableCommand(event);
    if (!command) return;
    const key = crypto.createHash('sha256').update(JSON.stringify(command)).digest('hex');
    if (capture.commands.size >= 200 && !capture.commands.has(key)) throw new Error('Trace budget exceeded');
    capture.commands.set(key, command);
  });
  const app = express();
  // Chỉ mount router từ snapshot chính xác, không import server.js hoặc config DB.
  app.use((req, res, next) => req.method === 'GET' && ['/api/classes', '/api/users'].includes(req.path)
    ? next() : res.sendStatus(405));
  const timing = path.join(message.sourceRoot, 'backend/middleware/apiPerformance.js');
  if (fs.existsSync(timing)) app.use('/api', require(timing));
  for (const route of ['classes', 'users']) {
    app.use(`/api/${route}`, require(path.join(message.sourceRoot, `backend/routes/${route}.js`)));
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
  send({ type: 'ready' });
}
async function measure(message) {
  if (!base || !['admin', 'teacher', 'student'].includes(message.role) ||
      !/^[a-f\d]{24}$/.test(message.actorId || '') || typeof message.path !== 'string' || message.path.length > 2000) {
    throw new Error('Invalid measurement');
  }
  const url = new URL(message.path, base);
  if (url.origin !== base || !['/api/classes', '/api/users'].includes(url.pathname) || url.hash) throw new Error('Invalid path');
  const token = jwt.sign({ userId: message.actorId, role: message.role }, secret, { expiresIn: '5m' });
  const trace = { commandCount: 0, writingCommandCount: 0, commands: new Map() };
  capture = trace;
  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(30000), redirect: 'error' });
    body = Buffer.from(await response.arrayBuffer());
  } finally { capture = null; }
  const durationMs = performance.now() - started;
  if (trace.writingCommandCount) throw new Error('Read workload issued non-read command');
  const parsed = JSON.parse(body.toString('utf8'));
  const rows = Array.isArray(parsed) ? parsed : parsed.data;
  if (response.status !== 200 || !Array.isArray(rows)) throw new Error('Unexpected response');
  const plans = [];
  // Hash toàn bộ JSON sau chuẩn hóa thứ tự key để so sánh cả summary/projection,
  // không chỉ số dòng hoặc ID. Không đưa nội dung hồ sơ vào báo cáo.
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  // EXPLAIN tách khỏi đồng hồ HTTP, chỉ xuất thống kê đã lọc chứ không xuất query.
  if (message.explain) {
    for (const command of trace.commands.values()) {
      const explanation = await mongoose.connection.db.command({ explain: { ...command, maxTimeMS: 30000 }, verbosity: 'executionStats' });
      plans.push({ collection: command.find || command.aggregate, operation: command.find ? 'find' : 'aggregate', ...planSummary(explanation) });
    }
  }
  send({ type: 'measurement', id: message.id, durationMs, decodedBytes: body.length, returnedRows: rows.length,
    rowIdDigest: crypto.createHash('sha256').update(rows.map((row) => String(row._id)).sort().join(',')).digest('hex'),
    bodyDigest: crypto.createHash('sha256').update(JSON.stringify(canonical(parsed))).digest('hex'),
    total: Array.isArray(parsed) ? rows.length : parsed.total, status: response.status,
    commandCount: trace.commandCount, writingCommandCount: trace.writingCommandCount, plans });
}
process.on('message', async (message) => {
  if (busy) { send({ type: 'error', id: message.id, stage: 'busy' }); return; }
  busy = true;
  try {
    if (message.type === 'init') await init(message);
    else if (message.type === 'measure') await measure(message);
    else if (message.type === 'stop') { await stop(); process.exit(0); }
    else throw new Error('Invalid message');
  } catch (error) {
    capture = null;
    send({ type: 'error', id: message.id, stage: message.type, name: error.name, code: error.code });
  } finally { busy = false; }
});
process.on('disconnect', () => stop().finally(() => process.exit(0)));
