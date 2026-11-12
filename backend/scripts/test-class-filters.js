const { spawn } = require('node:child_process');
const path = require('node:path');
const { createLab } = require('./lib/isolated-mongo');

// Chạy test trên replica set Docker riêng; không nạp .env hoặc URI ứng dụng.
async function main() {
  const resource = await createLab();
  try {
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--test', '--test-concurrency=1', path.join(__dirname, '../tests/classFilters.integration.test.js'),
        path.join(__dirname, '../tests/moderation.integration.test.js')], {
        env: { ...process.env, CLASS_FILTERS_TEST_MONGODB_URI: resource.uri, MODERATION_TEST_MONGODB_URI: resource.uri }, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    if (status) process.exitCode = status;
  } finally {
    const cleanup = await resource.cleanup();
    console.log(`Isolated MongoDB cleanup: ${cleanup.containerRemoved ? 'OK' : 'FAILED'}`);
  }
}
main().catch(() => { console.error('Class filter lab failed; check Docker and test output.'); process.exitCode = 1; });
