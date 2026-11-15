const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const SwaggerParser = require('@apidevtools/swagger-parser');
const spec = require('../openapi');
const docsRouter = require('../routes/apiDocs');

async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
const businessRouters = () => [
  ['/api/auth', require('../routes/auth')], ['/api/users', require('../routes/users')],
  ['/api/classes', require('../routes/classes')], ['/api/classes', require('../routes/sessions').classRouter],
  ['/api/sessions', require('../routes/sessions').sessionRouter], ['/api/videos', require('../routes/videos')],
  ['/api/documents', require('../routes/documents')], ['/api/quizzes', require('../routes/quizzes')],
  ['/api/assignments', require('../routes/assignments')], ['/api/announcements', require('../routes/announcements')],
  ['/api/student-warnings', require('../routes/studentWarnings')], ['/api/moderation', require('../routes/moderation')],
];

test('OpenAPI validates locally without external resolution, secrets or undefined references', async () => {
  const copy = JSON.parse(JSON.stringify(spec));
  await SwaggerParser.validate(copy, { resolve: { external: false } });
  assert.equal(spec.openapi, '3.0.3');
  assert.equal(spec.servers[0].url, '/');
  assert.ok(spec.servers.some((server) => server.url === 'https://eklasses.id.vn'));
  assert.ok(spec.servers.some((server) => server.url === 'http://localhost:5000'));
  assert.deepEqual(spec.security, [{ bearerAuth: [] }]);
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.equal(spec.components.schemas.AccountRegister.properties.password.writeOnly, true);
  assert.equal(spec.components.schemas.AccountRegister.properties.acceptedPolicies.enum[0], true);
  assert.equal(spec.components.schemas.PrivateUser.allOf[1].properties.password, undefined);
  assert.equal(spec.paths['/api/auth/logout'], undefined);
  assert.equal(spec.paths['/api/quizzes']?.get, undefined);
});

test('every actual business route has one documented operation, with no invented endpoints', () => {
  const actual = [];
  for (const [prefix, router] of businessRouters()) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const suffix = layer.route.path === '/' ? '' : layer.route.path;
      const route = `${prefix}${suffix}`.replace(/:(\w+)/g, '{$1}');
      for (const method of Object.keys(layer.route.methods)) actual.push(`${method} ${route}`);
    }
  }
  const documented = [];
  const ids = new Set();
  for (const [route, methods] of Object.entries(spec.paths)) {
    for (const [method, item] of Object.entries(methods)) {
      assert.ok(!ids.has(item.operationId), `Duplicate operation ID: ${item.operationId}`);
      assert.match(item.operationId, /^[a-zA-Z0-9]+$/, 'Deep links must not use deprecated underscore whitespace escaping');
      ids.add(item.operationId);
      assert.ok(item.summary && item.description && item.tags.length && item.responses);
      if (item.tags[0] !== 'Diagnostics') documented.push(`${method} ${route}`);
      assert.deepEqual(item.security, route.startsWith('/api/auth/') || item.tags[0] === 'Diagnostics' ? [] : [{ bearerAuth: [] }]);
      const placeholderNames = [...route.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      const params = (item.parameters || []).filter((param) => param.in === 'path');
      assert.deepEqual(params.map((param) => param.name), placeholderNames);
      for (const param of params) assert.equal(param.required, true);
      if (item.requestBody) {
        assert.ok(item.requestBody.content['application/json'].schema);
        assert.ok(item.requestBody.content['application/json'].example, `Missing request example for ${route}`);
      }
      for (const [code, response] of Object.entries(item.responses)) {
        assert.ok(response.description, `${route} ${code}`);
        assert.ok(Object.values(response.content).every((content) => content.schema));
      }
    }
  }
  assert.deepEqual(documented.sort(), actual.sort());
  assert.equal(actual.length, 76);
});

test('contracts retain distinct pagination, privacy, admission and grading semantics', () => {
  const get = (route) => spec.paths[route].get;
  const sessions = get('/api/classes/{id}/sessions');
  assert.ok(sessions.responses[200].content['application/json'].schema.properties.items);
  assert.equal(sessions.parameters.find((param) => param.name === 'limit').schema.maximum, 100);
  assert.equal(sessions.parameters.find((param) => param.name === 'page').schema.maximum, 100000);
  assert.equal(get('/api/student-warnings/mine').responses[200].content['application/json'].schema.type, 'array');
  assert.equal(get('/api/moderation/warnings').responses[200].content['application/json'].schema.allOf[0].$ref, '#/components/schemas/PaginationMeta');
  assert.deepEqual(spec.paths['/api/auth/register'].post.security, []);
  assert.ok(spec.paths['/api/auth/register'].post.responses[201]);
  assert.ok(spec.paths['/api/auth/register'].post.responses[202]);
  assert.match(get('/api/assignments/{id}').description, /only their own/);
  assert.match(spec.paths['/api/quizzes/{id}/submit'].post.description, /ARRAY POSITION/);
  assert.match(spec.paths['/api/student-warnings/{warningId}/review'].patch.description, /replica set/);
  assert.deepEqual(get('/api/moderation/summary')['x-roles'], ['admin']);
});

test('Swagger HTML, spec aliases and self-hosted assets load without authentication', async (t) => {
  const app = express();
  app.use('/api', docsRouter);
  app.use((req, res) => res.status(500).json({ message: 'Database must not be reached for docs' }));
  const origin = await serve(t, app);
  for (const pathname of ['/api/docs', '/api/docs/']) {
    const response = await fetch(`${origin}${pathname}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const html = await response.text();
    assert.match(html, /Swagger UI/);
    assert.match(html, /real requests/);
    assert.ok(!html.includes('unpkg.com') && !html.includes('cdn.jsdelivr'));
    assert.match(html, /\/api\/docs\/swagger-initializer.js/);
  }
  for (const pathname of ['/api/openapi.json', '/api/docs.json']) {
    const response = await fetch(`${origin}${pathname}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.match(response.headers.get('cache-control'), /public/);
    assert.deepEqual(await response.json(), spec);
  }
  for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js']) {
    const response = await fetch(`${origin}/api/docs/assets/${asset}`);
    assert.equal(response.status, 200, asset);
    assert.ok((await response.text()).length > 1000, asset);
  }
  const initializer = await (await fetch(`${origin}/api/docs/swagger-initializer.js`)).text();
  assert.match(initializer, /persistAuthorization: false/);
  assert.match(initializer, /queryConfigEnabled: false/);
  assert.match(initializer, /validatorUrl: null/);
  assert.match(initializer, /tryItOutEnabled: false/);
  assert.match(initializer, /url: '\/api\/openapi.json'/);
  for (const pathname of ['/api/docs/assets/package.json', '/api/docs/assets/constructor', '/api/docs/missing']) {
    assert.equal((await fetch(`${origin}${pathname}`)).status, 404);
  }
});

test('the real server serves documentation before its DB gate but preserves readiness checks', async (t) => {
  const mongoose = require('mongoose');
  const previousCache = global.mongoose;
  global.mongoose = { conn: null, promise: null };
  let connects = 0;
  t.mock.method(mongoose, 'connect', async () => { connects++; throw new Error('test database unavailable'); });
  const filename = require.resolve('../server');
  delete require.cache[filename];
  t.after(() => { global.mongoose = previousCache; delete require.cache[filename]; });
  const app = require('../server');
  const origin = await serve(t, app);
  const before = connects;
  for (const pathname of ['/api/docs', '/api/openapi.json', '/api/docs/assets/swagger-ui.css']) {
    assert.equal((await fetch(`${origin}${pathname}`)).status, 200);
  }
  assert.equal(connects, before);
  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 500);
  assert.ok(connects > before);
  assert.match(health.headers.get('cache-control'), /private/);
});

test('Vercel packaging explicitly includes the Swagger asset files', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../vercel.json'), 'utf8'));
  const pattern = config.functions['api/index.js'].includeFiles;
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js']) assert.ok(pattern.includes(file));
});
