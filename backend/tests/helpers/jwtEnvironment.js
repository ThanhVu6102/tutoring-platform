const { randomBytes } = require('node:crypto');

// Mỗi tiến trình test có khóa giả riêng; không đọc khóa ứng dụng hoặc dùng fallback.
process.env.JWT_SECRET = randomBytes(32).toString('hex');
module.exports = process.env.JWT_SECRET;
