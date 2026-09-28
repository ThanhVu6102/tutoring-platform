// Tạo tài khoản admin: npm run seed:admin --prefix backend
// Tuỳ chọn env: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, MONGODB_URI
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const ADMIN = {
  name: process.env.ADMIN_NAME || 'Quản trị viên',
  email: process.env.ADMIN_EMAIL || 'admin@eklasses.vn',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
};

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tutoring-platform';
  await mongoose.connect(uri);
  console.log('MongoDB connected');

  const existing = await User.findOne({ email: ADMIN.email });
  if (existing) {
    existing.role = 'admin';
    // Chỉ đổi password khi có ADMIN_PASSWORD (tránh ghi đè khi chạy lại)
    if (process.env.ADMIN_PASSWORD) existing.password = process.env.ADMIN_PASSWORD;
    if (process.env.ADMIN_NAME) existing.name = process.env.ADMIN_NAME;
    await existing.save();
    console.log(`Admin đã tồn tại, đã cập nhật quyền admin: ${ADMIN.email}`);
  } else {
    await new User({ ...ADMIN, role: 'admin' }).save();
    console.log(`Đã tạo admin: ${ADMIN.email} / ${ADMIN.password}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed admin thất bại:', err?.message || err);
  process.exit(1);
});
