// ============================================================================
// FILE: backend/models/Announcement.js
// MỤC ĐÍCH: Định nghĩa collection 'announcements' (thông báo trong lớp học).
// - Giáo viên/admin đăng thông báo theo lớp, đặt độ ưu tiên.
// - Theo dõi học sinh nào đã đọc (mảng readBy) để hiển thị "đã xem".
// QUAN HỆ: class -> Class, teacher -> User, readBy.student -> User.
// ============================================================================

// Nạp mongoose để định nghĩa schema/model MongoDB.
const mongoose = require('mongoose');

// Tạo schema cho 1 thông báo.
const announcementSchema = new mongoose.Schema({
  // Tiêu đề thông báo. Bắt buộc nhập (ví dụ: "Lịch kiểm tra giữa kỳ").
  title: {
    type: String,
    required: true,
  },
  // Nội dung chi tiết. Bắt buộc nhập (ví dụ: "Thứ 6 nộp bài...").
  content: {
    type: String,
    required: true,
  },
  // Lớp áp dụng: ObjectId tham chiếu sang collection Class.
  // Bắt buộc vì thông báo luôn thuộc về 1 lớp cụ thể.
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  // Người đăng: ObjectId tham chiếu sang User (giáo viên hoặc admin).
  // Bắt buộc để biết ai chịu trách nhiệm.
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Độ ưu tiên hiển thị: low (thấp) / normal (thường) / high (khẩn).
  // Mặc định 'normal'. Frontend dùng để tô màu, sắp xếp.
  priority: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal',
  },
  // Danh sách đã đọc: mỗi phần tử ghi 1 học sinh + thời điểm đọc.
  // - student: ObjectId tham chiếu User (học sinh đã bấm "đã đọc").
  // - readAt: thời điểm đọc, dùng để thống kê.
  readBy: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    readAt: Date,
  }],
  // Ngày tạo thông báo. Mặc định là thời điểm hiện tại.
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Ngày sửa cuối. API PUT tự gán lại khi giáo viên chỉnh nội dung.
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Xuất model 'Announcement' để routes dùng: find, tạo mới, cập nhật readBy...
module.exports = mongoose.model('Announcement', announcementSchema);
