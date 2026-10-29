// ============================================================================
// FILE: backend/models/User.js
// MỤC ĐÍCH: Định nghĩa cấu trúc (schema) collection 'users' trong MongoDB.
// - Lưu học sinh (student), giáo viên (teacher) và quản trị (admin).
// - Tự động hash mật khẩu bằng bcrypt trước khi lưu.
// - Tự bảo vệ Super Admin gốc: luôn giữ email chuẩn + role admin.
// ============================================================================

// Nạp mongoose để định nghĩa schema/model MongoDB.
const mongoose = require('mongoose');
// Nạp bcryptjs để hash mật khẩu (không lưu mật khẩu thô) và so sánh khi login.
const bcrypt = require('bcryptjs');

// Tạo schema (khuôn mẫu) cho 1 document user.
const userSchema = new mongoose.Schema({
  // Họ tên hiển thị. Bắt buộc nhập khi đăng ký.
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  // Email đăng nhập. Bắt buộc, duy nhất (unique) để không trùng tài khoản.
  // Được chuẩn hóa về chữ thường ở hook pre-save bên dưới.
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 255,
  },
  // Mật khẩu đã hash bằng bcrypt. Khi tạo/sửa, gán mật khẩu thô rồi hook tự hash.
  // select:false -> mọi truy vấn mặc định KHÔNG lấy password, tránh lộ hash.
  // Nơi cần kiểm tra mật khẩu (login, ensureSuperAdmin) phải .select('+password').
  password: {
    type: String,
    required: true,
    select: false,
  },
  // Vai trò: student (học sinh), teacher (giáo viên), admin (quản trị).
  // Super Admin gốc luôn bị ép về 'admin'.
  role: {
    type: String,
    enum: ['teacher', 'student', 'admin'],
    required: true,
  },
  // Trạng thái tài khoản theo vòng đời (mục 3.1 tài liệu luồng xử lý):
  // - pending:  mới đăng ký, chờ admin duyệt (giáo viên).
  // - active:   đang hoạt động.
  // - inactive: tạm nghỉ (tự chuyển về active qua block/unblock hợp lý).
  // - left:     đã rời trung tâm.
  // - rejected: hồ sơ bị admin từ chối.
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive', 'left', 'rejected'],
    default: 'active',
  },
  // Cờ khóa đăng nhập, tách riêng khỏi status (mục 1 tài liệu):
  // tài khoản còn 'active' nhưng bị khóa thì vẫn không đăng nhập được.
  isBlocked: {
    type: Boolean,
    default: false,
  },
  // Lưu quyết định ngay trên tài khoản để trạng thái và dấu vết duyệt
  // được cập nhật nguyên tử, kể cả khi MongoDB local không có replica set.
  review: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    note: { type: String, maxlength: 2000 },
  },
  // Khóa ghi dùng cho transaction xếp lịch; không trả ra client.
  scheduleRevision: { type: Number, default: 0, select: false },
  // Thời điểm xóa mềm. Có giá trị -> tài khoản coi như đã xóa, không đủ điều kiện
  // đăng nhập, nhưng dữ liệu lịch sử (lớp, nộp bài...) vẫn giữ nguyên vẹn.
  deletedAt: {
    type: Date,
    default: null,
  },
  // Link ảnh đại diện. Mặc định null (chưa có ảnh).
  avatar: {
    type: String,
    default: null,
    maxlength: 2000,
  },
  // Giới thiệu bản thân. Mặc định chuỗi rỗng.
  bio: {
    type: String,
    default: '',
    maxlength: 2000,
  },
  // Số điện thoại. Mặc định chuỗi rỗng.
  phone: {
    type: String,
    default: '',
    trim: true,
    maxlength: 30,
  },
  // Danh sách lớp đã tham gia (mảng ObjectId tham chiếu sang collection Class).
  enrolledClasses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
  }],
  // Ngày tạo tài khoản. Mặc định là thời điểm hiện tại.
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Ngày cập nhật cuối. Được gán tay ở các API PUT (profile, role...).
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ----------------------------------------------------------------------------
// HOOK: userSchema.pre('save')
// THỜI ĐIỂM CHẠY: Tự động chạy trước mỗi lệnh user.save() / new User().save().
// NHIỆM VỤ 1 - BẢO VỆ SUPER ADMIN:
//   + Chuẩn hóa mọi email về chữ thường, bỏ khoảng trắng.
//   + Nếu đúng email gốc (admin@eklasses.vn) thì ép role về 'admin'.
//     -> Dù API nào cố tình hạ quyền, DB vẫn giữ admin.
// NHIỆM VỤ 2 - HASH MẬT KHẨU:
//   + Nếu password không đổi (sửa tên/avatar...) thì bỏ qua, gọi next() luôn.
//   + Nếu password mới/đổi thì sinh salt + hash bằng bcrypt rồi mới cho lưu.
// ----------------------------------------------------------------------------
userSchema.pre('save', async function(next) {
  // BƯỚC 1: Bảo vệ Super Admin gốc, đồng thời chuẩn hóa email.
  try {
    // Nạp config admin cố định ngay trong hook để không vòng lặp require.
    const DEFAULT_ADMIN = require('../config/defaultAdmin');
    // Nếu email là chuỗi thì trim + lowerCase để 'ADMIN@...' cũng thành chuẩn.
    if (typeof this.email === 'string') {
      this.email = this.email.trim().toLowerCase();
    }
    // Nếu trùng email gốc thì ép email chuẩn + role admin.
    if (this.email === DEFAULT_ADMIN.email.toLowerCase()) {
      this.email = DEFAULT_ADMIN.email.toLowerCase();
      this.role = 'admin';
    }
  } catch (_) {
    // Nếu lỗi nạp config (hiếm) thì bỏ qua, vẫn cho lưu tiếp.
  }

  // BƯỚC 2: Nếu password không bị sửa thì không cần hash lại -> qua tiếp.
  if (!this.isModified('password')) return next();

  // BƯỚC 3: Hash mật khẩu mới.
  try {
    // Sinh chuỗi salt ngẫu nhiên (độ mạnh 10) để chống dò từ điển.
    const salt = await bcrypt.genSalt(10);
    // Hash mật khẩu thô + salt thành chuỗi an toàn để lưu DB.
    this.password = await bcrypt.hash(this.password, salt);
    // Cho phép tiếp tục lệnh save().
    next();
  } catch (error) {
    // Lỗi hash -> chuyển cho mongoose báo lỗi save().
    next(error);
  }
});

// ----------------------------------------------------------------------------
// METHOD: user.comparePassword(candidatePassword)
// SO SÁNH: mật khẩu người dùng nhập với hash trong DB (dùng bcrypt.compare).
// - candidatePassword: chuỗi thô từ form login.
// - Trả về true (đúng) / false (sai). Dùng ở API login và ensureSuperAdmin.
// ----------------------------------------------------------------------------
userSchema.methods.comparePassword = async function(candidatePassword) {
  // bcrypt tự tách salt trong hash cũ để so sánh an toàn.
  return await bcrypt.compare(candidatePassword, this.password);
};

// ----------------------------------------------------------------------------
// INDEX: tăng tốc truy vấn danh sách/phân quyền thường dùng.
// - email đã có unique index ở khai báo trường.
// - (role, createdAt): lọc user theo vai trò + sắp xếp mới nhất.
// - enrolledClasses: tìm user thuộc 1 lớp (đồng bộ ngược từ Class.students).
// ----------------------------------------------------------------------------
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ enrolledClasses: 1 });
// Hỗ trợ lọc trạng thái + xóa mềm và tìm kiếm admin nhanh.
userSchema.index({ status: 1, isBlocked: 1, deletedAt: 1 });

// Xuất model 'User' để các file khác dùng: User.findOne, new User, ...
module.exports = mongoose.model('User', userSchema);
