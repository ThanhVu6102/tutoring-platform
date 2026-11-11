const { spawn } = require('node:child_process');
const path = require('node:path');
const { createLab } = require('./lib/isolated-mongo');

// Lab chỉ dùng replica set Docker do lần chạy sở hữu; không nạp .env/URI ứng dụng.
async function main() {
  const resource = await createLab();
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--test', path.join(__dirname, '../tests/contentSecurity.integration.test.js')], {
        env: { ...process.env, CONTENT_SECURITY_TEST_MONGODB_URI: resource.uri }, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (status) => resolve(status ?? 1));
    });
    if (code) process.exitCode = code;
  } finally {
    const cleanup = await resource.cleanup();
    console.log(`Dọn lab bảo mật học liệu: ${JSON.stringify(cleanup)}`);
    if (!cleanup.containerRemoved || !cleanup.databaseDropped) process.exitCode = 1;
  }
}
main().catch(() => { console.error('Không hoàn tất lab bảo mật học liệu; kiểm tra Docker/test'); process.exitCode = 1; });
