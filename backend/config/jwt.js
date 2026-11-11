// Kiểm tra cùng một chính sách trước mọi lần ký/xác minh; không có khóa dự phòng.
// Độ dài không chứng minh entropy: vận hành phải sinh khóa bằng CSPRNG/secret manager.
function jwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32
    || Buffer.byteLength(secret, 'utf8') > 1024 || secret !== secret.trim()
    || /[\u0000-\u001f\u007f]/u.test(secret)
    || /your[-_\s]?secret|change[-_\s]?me|replace[-_\s]?me|ma_bao_mat|example|placeholder/i.test(secret)
    || /^(.{1,16})\1+$/u.test(secret)) {
    throw new Error('Cấu hình JWT không hợp lệ');
  }
  return secret;
}

// Lỗi cấu hình là 503, không phải mật khẩu/token sai; không in khóa ra log/response.
function requireJwtConfiguration(req, res, next) {
  try {
    req.jwtSecret = jwtSecret();
    next();
  } catch {
    return res.status(503).json({ message: 'Dịch vụ xác thực chưa sẵn sàng' });
  }
}

module.exports = { jwtSecret, requireJwtConfiguration };
