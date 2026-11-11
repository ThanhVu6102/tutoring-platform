const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const axios = require('axios');
// Kiểm tra đúng dependency mà Axios thực sự resolve, không thêm dependency trực tiếp.
const redirects = createRequire(require.resolve('axios'))('follow-redirects');

async function server(t, handler) {
  const instance = http.createServer(handler);
  instance.listen(0, '127.0.0.1');
  await new Promise((resolve) => instance.once('listening', resolve));
  t.after(async () => { instance.closeAllConnections(); await new Promise((resolve) => instance.close(resolve)); });
  return `http://127.0.0.1:${instance.address().port}`;
}

async function fixture(t) {
  const target = await server(t, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.headers));
  });
  return server(t, (req, res) => {
    if (req.url === '/same') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(req.headers));
    }
    res.writeHead(302, { Location: req.url === '/local' ? '/same' : target });
    res.end();
  });
}

function get(url, options) {
  return new Promise((resolve, reject) => {
    const request = redirects.http.get(url, options, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve({ status: response.statusCode, headers: JSON.parse(body) }); } catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    request.setTimeout(5000, () => request.destroy(new Error('Hết hạn HTTP test local')));
    request.on('error', reject);
  });
}

test('redirect khác origin loại custom credential kể cả sensitiveHeaders từ realm khác', async (t) => {
  const base = await fixture(t);
  const crossRealm = vm.runInNewContext("['X-API-Key']");
  assert.equal(Array.isArray(crossRealm), true);
  assert.equal(crossRealm instanceof Array, false);
  for (const sensitiveHeaders of [['X-API-Key'], crossRealm]) {
    for (const headers of [{ 'X-API-Key': 'synthetic-test-credential', 'X-Harmless': 'retained' },
      ['X-API-Key', 'synthetic-test-credential', 'X-Harmless', 'retained']]) {
      const result = await get(`${base}/cross`, { sensitiveHeaders, headers, maxRedirects: 3 });
      assert.equal(result.status, 200);
      assert.equal(result.headers['x-api-key'], undefined);
      assert.equal(result.headers['x-harmless'], 'retained');
    }
  }
});

test('redirect cùng origin giữ credential cần thiết và response hoạt động bình thường', async (t) => {
  const base = await fixture(t);
  const result = await get(`${base}/local`, { sensitiveHeaders: ['X-API-Key'],
    headers: { 'X-API-Key': 'synthetic-test-credential' } });
  assert.equal(result.status, 200);
  assert.equal(result.headers['x-api-key'], 'synthetic-test-credential');
});

test('Axios sau cập nhật vẫn theo redirect và không chuyển Authorization/Cookie sang origin khác', async (t) => {
  const base = await fixture(t);
  const response = await axios.get(`${base}/cross`, { proxy: false, timeout: 5000, maxRedirects: 3,
    headers: { Authorization: 'Bearer synthetic-test-token', Cookie: 'synthetic=test', 'X-Harmless': 'retained' } });
  assert.equal(response.status, 200);
  assert.equal(response.data.authorization, undefined);
  assert.equal(response.data.cookie, undefined);
  assert.equal(response.data['x-harmless'], 'retained');
});
