const { ref, string, date, object, json, operation } = require('./helpers');
const modules = [require('./accounts'), require('./classes'), require('./learning'), require('./operations')];
const paths = {};
const schemas = { ...require('./schemas') };
for (const part of modules) {
  for (const [path, methods] of Object.entries(part.paths)) {
    for (const method of Object.keys(methods)) {
      if (paths[path]?.[method]) throw new Error(`Duplicate OpenAPI operation: ${method} ${path}`);
    }
    paths[path] = { ...paths[path], ...methods };
  }
  for (const [name, schema] of Object.entries(part.schemas)) {
    if (schemas[name]) throw new Error(`Duplicate OpenAPI schema: ${name}`);
    schemas[name] = schema;
  }
}
paths['/api/health'] = { get: operation('get', '/api/health', 'Diagnostics', 'Check API and database readiness',
  object({ status: string({ enum: ['ok'] }), time: date() }, ['status', 'time']), {
    public: true, errors: [500], description: 'Unlike the documentation routes, health still passes through the database connection gate. A database failure returns 500; a 200 does not prove all authenticated flows work.',
  }) };
paths['/api/docs'] = { get: operation('get', '/api/docs', 'Diagnostics', 'Open the Swagger UI', ref('Message'), {
  public: true, errors: [], responses: { 200: { description: 'Swagger UI HTML; no database or authentication required.', content: { 'text/html': { schema: string() } } } },
}) };
for (const path of ['/api/openapi.json', '/api/docs.json']) {
  paths[path] = { get: operation('get', path, 'Diagnostics', 'Download the OpenAPI document', { type: 'object', additionalProperties: true }, {
    public: true, errors: [], description: 'OpenAPI 3.0.3 JSON. /api/docs.json is an alias. Available without database connectivity; contains no credentials or environment secrets.',
  }) };
}

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'EKLASSES API', version: '1.0.0',
    description: 'Complete route reference for the implemented EKLASSES backend.\n\n'
      + '**Authentication:** Register/sign in, copy the returned token, then use **Authorize** (paste the token only). Tokens expire after seven days; the database role/account status is checked on each protected request. No server logout or token-revocation endpoint exists.\n\n'
      + '**Safety:** Try it out sends REAL requests to the selected server. Writes change data; moderation GETs can finalize expired warnings. Use a seeded local/test database for experiments. Never paste a token on an untrusted documentation page. Swagger does not persist authorization on reload.\n\n'
      + '**Contracts:** Most lists use {data,page,limit,total,totalPages}, default 20/cap 100. Sessions instead return {items,page,limit,total}; some legacy lists return arrays. Read each operation for exact role, ownership, state and privacy rules. JSON parser limit: 7 MB.\n\n'
      + '**Documentation only:** Schemas describe accepted data, not newly installed runtime validation. Known legacy limitations (including quiz deadline enforcement and some 500 responses for validation) are documented rather than silently fixed. No real credentials or private user records are included.',
  },
  servers: [{ url: '/', description: 'Current origin (recommended; works on local, preview and production)' },
    { url: 'https://eklasses.id.vn', description: 'Production — real data, use cautiously' },
    { url: 'http://localhost:5000', description: 'Local backend — use a local documentation page to avoid mixed-content restrictions' }],
  tags: [
    ['Authentication', 'Public registration and sign-in.'], ['Users', 'Personal profiles, passwords, administrator account lifecycle and audit records.'],
    ['Classes', 'Class metadata, admission, membership, lock notices and teacher appeals.'],
    ['Sessions', 'Scheduling, state transitions and attendance.'], ['Videos', 'Linked videos and view events; no binary upload.'],
    ['Documents', 'Linked files and download counters; no binary upload.'], ['Quizzes', 'Quiz authoring, publication, submission and grading.'],
    ['Assignments', 'URL submissions, grading and viewer-specific privacy.'], ['Announcements', 'Class announcements and read receipts.'],
    ['StudentWarnings', 'Student warning/appeal/review workflow.'], ['Moderation', 'Administrator totals and paginated review queues.'],
    ['Diagnostics', 'Health and public documentation.'],
  ].map(([name, description]) => ({ name, description })),
  security: [{ bearerAuth: [] }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
    description: 'Paste the JWT from POST /api/auth/login without the Bearer prefix. Current database permissions still apply.' } }, schemas },
  paths,
};
