const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { activeAccountFilter } = require('./accountAccess');
const { fail } = require('./sessionValidation');

async function changePassword(userId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Dữ liệu không hợp lệ');
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword, 'utf8') > 72) {
    fail(400, 'Vui lòng nhập mật khẩu hiện tại hợp lệ (tối đa 72 byte UTF-8)');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    fail(400, 'Mật khẩu mới cần ít nhất 8 ký tự và không vượt quá 72 byte UTF-8');
  }
  const user = await User.findOne({ _id: userId, ...activeAccountFilter() }).select('email +password');
  if (!user) fail(403, 'Tài khoản không hoạt động hoặc không còn tồn tại');
  if (!await bcrypt.compare(currentPassword, user.password)) fail(400, 'Mật khẩu hiện tại không đúng');
  if (currentPassword === newPassword) fail(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');

  // Hash tường minh vì updateOne không chạy hook save. Điều kiện hash cũ chống
  // hai lần đổi cạnh tranh hoặc tài khoản vừa bị chặn/xóa trong lúc tính bcrypt.
  const hash = await bcrypt.hash(newPassword, 10);
  const result = await User.updateOne(
    { _id: userId, password: user.password, ...activeAccountFilter() },
    { $set: { password: hash, updatedAt: new Date() } }, { runValidators: true }
  );
  if (result.modifiedCount !== 1) fail(409, 'Tài khoản hoặc mật khẩu đã thay đổi, vui lòng thử lại');
}

module.exports = { changePassword };
