// Chỉ gửi GET, lấy token qua biến môi trường để tránh lộ trong command history.
const fs = require('node:fs');
const base = process.env.BENCH_BASE_URL || 'http://localhost:5000';
const token = process.env.BENCH_TOKEN;
const samples = Number(process.env.BENCH_SAMPLES || 10);

async function main() {
  if (!token) throw new Error('Cần BENCH_TOKEN của tài khoản thử nghiệm');
  if (!Number.isInteger(samples) || samples < 2 || samples > 100) throw new Error('BENCH_SAMPLES phải từ 2 đến 100');
  const report = { at: new Date().toISOString(), label: process.env.BENCH_LABEL || 'unlabelled', results: [] };
  for (const path of ['/api/classes?page=1&limit=20', '/api/users?page=1&limit=20']) {
    const timings = [];
    const sizes = [];
    let firstMs;
    let encoding;
    for (let i = 0; i <= samples; i += 1) {
      const start = performance.now();
      const response = await fetch(new URL(path, base), {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
      });
      const body = await response.arrayBuffer();
      const ms = performance.now() - start;
      if (!response.ok) throw new Error(`${path.split('?')[0]} trả HTTP ${response.status}; cần tài khoản admin thử nghiệm`);
      if (i === 0) { firstMs = ms; encoding = response.headers.get('content-encoding') || 'none'; }
      else { timings.push(ms); sizes.push(body.byteLength); }
    }
    timings.sort((a, b) => a - b);
    report.results.push({ path, firstRequestMs: firstMs, samples,
      medianMs: (timings[Math.floor((samples - 1) / 2)] + timings[Math.ceil((samples - 1) / 2)]) / 2,
      p95Ms: timings[Math.ceil(samples * .95) - 1],
      averageDecodedBytes: sizes.reduce((a, b) => a + b, 0) / samples, contentEncoding: encoding });
  }
  // Báo cáo không chứa token, base URL, nội dung response hoặc dữ liệu người dùng.
  const json = JSON.stringify(report, null, 2);
  if (process.env.BENCH_OUT) fs.writeFileSync(process.env.BENCH_OUT, json);
  console.log(json);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
