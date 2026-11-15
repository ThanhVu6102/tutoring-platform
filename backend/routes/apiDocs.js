const express = require('express');
const spec = require('../openapi');
const router = express.Router();

// Chỉ phục vụ allowlist asset, không mở toàn bộ thư mục node_modules.
// require.resolve với tên cố định giúp bộ đóng gói serverless tìm đúng file.
const assets = {
  'swagger-ui.css': require.resolve('swagger-ui-dist/swagger-ui.css'),
  'swagger-ui-bundle.js': require.resolve('swagger-ui-dist/swagger-ui-bundle.js'),
  'swagger-ui-standalone-preset.js': require.resolve('swagger-ui-dist/swagger-ui-standalone-preset.js'),
};
const securityHeaders = (res) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://eklasses.id.vn http://localhost:5000; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
};
router.get(['/openapi.json', '/docs.json'], (req, res) => {
  securityHeaders(res);
  res.set('Cache-Control', 'public, max-age=300, s-maxage=300').json(spec);
});
router.get(['/docs', '/docs/'], (req, res) => {
  securityHeaders(res);
  res.set('Cache-Control', 'public, max-age=300, s-maxage=300').type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>EKLASSES API — Swagger UI</title><link rel="stylesheet" href="/api/docs/assets/swagger-ui.css">
<link rel="stylesheet" href="/api/docs/eklasses.css"></head>
<body><header class="api-docs-header"><h1>EKLASSES API</h1>
<p>Swagger / OpenAPI 3.0.3 · <a href="/api/openapi.json">Download JSON</a> · <a href="/">Application</a></p>
<p><strong>Try it out sends real requests.</strong> Choose a local/test server before experimenting. Moderation reads may also change expired warning states. Authorization is not saved on reload.</p></header>
<main id="swagger-ui"></main><noscript>Enable JavaScript to view Swagger UI, or download the OpenAPI JSON.</noscript>
<script src="/api/docs/assets/swagger-ui-bundle.js"></script><script src="/api/docs/assets/swagger-ui-standalone-preset.js"></script>
<script src="/api/docs/swagger-initializer.js"></script></body></html>`);
});
router.get('/docs/swagger-initializer.js', (req, res) => {
  securityHeaders(res);
  res.set('Cache-Control', 'public, max-age=300').type('js').send(`window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'BaseLayout',
    validatorUrl: null, queryConfigEnabled: false, persistAuthorization: false,
    tryItOutEnabled: false, filter: true, docExpansion: 'none', displayRequestDuration: true,
    defaultModelsExpandDepth: 0
  });
};`);
});
router.get('/docs/eklasses.css', (req, res) => {
  securityHeaders(res);
  res.set('Cache-Control', 'public, max-age=300').type('css').send(`body{margin:0;background:#fafafa}
.api-docs-header{padding:20px max(20px,calc((100% - 1460px)/2));background:#fff;border-bottom:3px solid #e63946;font:15px/1.5 system-ui,sans-serif;color:#24352d}
.api-docs-header h1{margin:0;font-size:24px}.api-docs-header a{color:#a4161a}
.api-docs-header p{margin:8px 0}.swagger-ui .topbar{display:none}`);
});
router.get('/docs/assets/:file', (req, res, next) => {
  securityHeaders(res);
  if (!Object.hasOwn(assets, req.params.file)) return res.status(404).json({ message: 'Documentation asset not found' });
  return res.sendFile(assets[req.params.file], { maxAge: '1h' }, (error) => {
    if (error) next(error);
  });
});
// Asset tài liệu không tồn tại phải trả 404, không rơi xuống database gate.
router.use('/docs', (req, res) => res.status(404).json({ message: 'Documentation route not found' }));

module.exports = router;
