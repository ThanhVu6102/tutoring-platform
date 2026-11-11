require('dotenv').config();
const mongoose = require('mongoose');
const { adminBootstrapConfig, bootstrapAdmin } = require('./utils/adminBootstrap');

async function main() {
  // Validate trước khi kết nối; không fallback URI để tránh ghi nhầm database.
  const config = adminBootstrapConfig(process.env);
  if (!process.env.MONGODB_URI) throw new Error('Cần cấu hình MONGODB_URI');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await bootstrapAdmin(config);
    console.log('Đã tạo tài khoản quản trị. Hãy xóa ADMIN_PASSWORD khỏi môi trường bootstrap.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(() => {
    // Không in lỗi DB vì có thể chứa URI, payload hoặc thông tin nhạy cảm.
    console.error('Không thể bootstrap admin. Kiểm tra cấu hình, kết nối và tài khoản đã tồn tại; không tài khoản nào được reset.');
    process.exitCode = 1;
  });
}

module.exports = { main };
