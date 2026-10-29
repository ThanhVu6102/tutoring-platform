// ============================================================================
// FILE: backend/models/Class.js
// MỤC ĐÍCH: Định nghĩa collection 'classes' (lớp học) - trung tâm của hệ thống.
// - Giáo viên/admin tạo lớp, thêm học sinh bằng email.
// - Mọi học liệu (video, tài liệu, quiz, assignment, announcement) đều gắn
//   vào 1 lớp qua trường class.
// QUAN HỆ: teacher -> User, students[] -> User.
// ============================================================================

// Nạp mongoose để định nghĩa schema/model MongoDB.
const mongoose = require('mongoose');

// Tạo schema cho 1 lớp học.
const classSchema = new mongoose.Schema({
  // Tên lớp. Bắt buộc (ví dụ: "Toán 12 - Ôn thi THPT").
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
  },
  // Mô tả lớp. Mặc định rỗng.
  description: {
    type: String,
    default: '',
    maxlength: 5000,
  },
  // Giáo viên phụ trách: ObjectId tham chiếu User. Bắt buộc.
  // Admin tạo lớp thì teacher là chính admin đó (hoặc giáo viên được chỉ định).
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Danh sách học sinh: mảng ObjectId tham chiếu User.
  // Thêm bằng API POST /api/classes/:id/enroll (nhập email học sinh).
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Môn học. Bắt buộc (ví dụ: "Toán", "Lý", "Anh").
  // Dùng để lọc/tìm kiếm ở Dashboard.
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  // Khối / trình độ (ví dụ: "12", "IELTS"). Mặc định rỗng.
  grade: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100,
  },
  // Sĩ số tối đa. Mặc định 50. API enroll chặn khi vượt quá.
  capacity: {
    type: Number,
    default: 50,
    min: 1,
    max: 1000,
  },
  sessionRevision: { type: Number, default: 0, select: false },
  // Lịch học: thứ trong tuần + giờ bắt đầu/kết thúc (chuỗi, ví dụ "19:00").
  // Lưu gọn trong object con, không cần collection riêng.
  schedule: {
    dayOfWeek: String,
    startTime: String,
    endTime: String,
  },
  // Ảnh bìa lớp. Mặc định null (hiện ảnh placeholder ở frontend).
  thumbnail: {
    type: String,
    default: null,
  },
  // Trạng thái: active (đang mở) / inactive (đã đóng/lưu trữ).
  // Mặc định 'active'.
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  // Ngày tạo lớp. Mặc định hiện tại.
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Ngày sửa cuối. API PUT tự gán lại khi đổi tên/mô tả/lịch...
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ----------------------------------------------------------------------------
// INDEX: các truy vấn chính của Dashboard/chi tiết lớp.
// - { teacher, createdAt }: giáo viên xem lớp mình dạy, mới nhất trước.
// - { students }: học sinh xem lớp đã tham gia.
// - { status }: lọc lớp đang hoạt động.
// ----------------------------------------------------------------------------
classSchema.index({ teacher: 1, createdAt: -1 });
classSchema.index({ students: 1 });
classSchema.index({ status: 1 });

// Xuất model 'Class' để routes dùng: tạo lớp, ghi danh, phân quyền xem lớp...
module.exports = mongoose.model('Class', classSchema);
