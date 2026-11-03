// Đo tổng thời gian server trước khi gửi header, không cache dữ liệu cá nhân ở CDN.
function apiPerformance(req, res, next) {
  const started = process.hrtime.bigint();
  const writeHead = res.writeHead;
  res.setHeader('Cache-Control', 'private, no-store');
  res.writeHead = function(...args) {
    const duration = Number(process.hrtime.bigint() - started) / 1e6;
    this.setHeader('Server-Timing', `app;dur=${duration.toFixed(2)}`);
    return writeHead.apply(this, args);
  };
  res.on('finish', () => {
    if (process.env.PERF_LOG_ENABLED !== 'true') return;
    // Chỉ log mẫu route, không log ID thật, query string, body, token hoặc secret.
    console.log(JSON.stringify({ event: 'api_timing', method: req.method,
      route: req.route ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched',
      status: res.statusCode, durationMs: Number(process.hrtime.bigint() - started) / 1e6 }));
  });
  next();
}

module.exports = apiPerformance;
