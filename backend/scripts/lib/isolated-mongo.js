const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: pause } = require('node:timers/promises');
const { mongo } = require('mongoose');
const exec = promisify(execFile);
const image = 'mongo:7.0.45';

async function docker(args, timeout = 30000) {
  return (await exec('docker', args, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 })).stdout.trim();
}

// Chỉ tạo container loopback do lần chạy sở hữu; không nhận URI/database bên ngoài.
async function createLab() {
  await docker(['info', '--format', '{{.ServerVersion}}'], 15000);
  const id = crypto.randomBytes(12).toString('hex');
  const container = `tutoring-code-${id}`;
  const database = `perf_code_${id}`;
  let attempted = false;
  let client;
  const assertOwner = async () => {
    const labels = JSON.parse(await docker(['inspect', '--format', '{{json .Config.Labels}}', container]));
    if (labels?.['tutoring.lab'] !== 'be04-code' || labels?.['tutoring.run'] !== id) {
      throw new Error('Không xác minh được container lab');
    }
  };
  const cleanup = async () => {
    const result = {};
    try {
      if (client) {
        await assertOwner();
        if (database !== `perf_code_${id}` || !/^perf_code_[a-f\d]{24}$/.test(database)) throw new Error('Sai database lab');
        await client.db(database).dropDatabase();
        result.databaseDropped = true;
      }
    } finally {
      try { if (client) await client.close(); }
      finally {
        if (attempted) {
          await assertOwner();
          await docker(['rm', '--force', '--volumes', container]);
          result.containerRemoved = true;
        }
      }
    }
    return result;
  };
  try {
    attempted = true;
    await docker(['run', '--detach', '--name', container,
      '--label', 'tutoring.lab=be04-code', '--label', `tutoring.run=${id}`,
      '--publish', '127.0.0.1::27017', '--memory', '1g', '--cpus', '2',
      '--tmpfs', '/data/db:rw,size=768m', '--tmpfs', '/data/configdb:rw,size=64m',
      image, 'mongod', '--replSet', 'perf-rs', '--bind_ip_all', '--wiredTigerCacheSizeGB', '0.25'], 180000);
    await assertOwner();
    const address = await docker(['port', container, '27017/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('Port không phải loopback');
    const directUri = `mongodb://${address}/?directConnection=true`;
    const deadline = Date.now() + 60000;
    while (!client) {
      const candidate = new mongo.MongoClient(directUri, { serverSelectionTimeoutMS: 1000 });
      try { await candidate.connect(); client = candidate; }
      catch {
        await candidate.close();
        if (Date.now() >= deadline) throw new Error('MongoDB lab không sẵn sàng');
        await pause(300);
      }
    }
    await client.db('admin').command({ replSetInitiate: { _id: 'perf-rs', members: [{ _id: 0, host: '127.0.0.1:27017' }] } });
    while (!(await client.db('admin').command({ hello: 1 })).isWritablePrimary) {
      if (Date.now() >= deadline) throw new Error('Replica set không có primary');
      await pause(300);
    }
    return { id, container, database, image, uri: `${directUri}&replicaSet=perf-rs`, client, cleanup };
  } catch (error) {
    try { await cleanup(); } catch { throw new Error('Khởi tạo lỗi và cần kiểm tra cleanup container lab'); }
    throw error;
  }
}

module.exports = { createLab };
