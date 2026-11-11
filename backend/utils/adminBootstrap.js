const User = require('../models/User');

function adminBootstrapConfig(env) {
  const email = typeof env.ADMIN_EMAIL === 'string' ? env.ADMIN_EMAIL.trim().toLowerCase() : '';
  const name = typeof env.ADMIN_NAME === 'string' ? env.ADMIN_NAME.trim() : 'Quản trị viên';
  const password = env.ADMIN_PASSWORD;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || !name || name.length > 200) {
    throw new Error('Cần cấu hình ADMIN_EMAIL và ADMIN_NAME hợp lệ');
  }
  // Dùng mật khẩu ngẫu nhiên từ password manager; bcrypt tối đa 72 byte.
  if (typeof password !== 'string' || password.length < 16 || !password.trim()
    || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD cần ít nhất 16 ký tự và không vượt quá 72 byte UTF-8');
  }
  return { email, name, password };
}

async function bootstrapAdmin(config) {
  const admin = adminBootstrapConfig({ ADMIN_EMAIL: config?.email, ADMIN_NAME: config?.name, ADMIN_PASSWORD: config?.password });
  // Tuyệt đối không nâng quyền, mở khóa hoặc reset tài khoản đã tồn tại.
  if (await User.exists({ email: admin.email })) throw new Error('Tài khoản đã tồn tại; không thay đổi');
  // Unique index email ngăn hai lần bootstrap cạnh tranh tạo trùng tài khoản.
  return new User({ ...admin, role: 'admin', status: 'active' }).save();
}

module.exports = { adminBootstrapConfig, bootstrapAdmin };
