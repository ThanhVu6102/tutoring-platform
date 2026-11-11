const { email } = require('../config/defaultAdmin');

// Bảo vệ danh tính admin gốc; không xác thực mật khẩu hay ghi DB ở đây.
function isSuperAdminEmail(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === email;
}

module.exports = { isSuperAdminEmail };
