// Vercel serverless entry: mọi request /api/* được rewrite về đây
const app = require('../backend/server');

module.exports = app;
