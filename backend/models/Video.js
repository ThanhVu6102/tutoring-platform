// ============================================================================
// FILE: backend/models/Video.js
// MỤC ĐÍCH: Định nghĩa collection 'videos' (video bài giảng theo URL).
// - Backend chỉ lưu metadata (tiêu đề, link video, thumbnail...), không lưu
//   file video trực tiếp.
// - Đếm lượt xem (views) + chi tiết ai xem (viewedBy) để tính mức độ học.
// QUAN HỆ: class -> Class, teacher -> User, viewedBy.student -> User.
// ============================================================================

// Nạp mongoose để định nghĩa schema/model MongoDB.
const mongoose = require('mongoose');

// Tạo schema cho 1 video bài giảng.
const videoSchema = new mongoose.Schema({
  // Tiêu đề video. Bắt buộc (ví dụ: "Bài 1: Hàm số").
  title: {
    type: String,
    required: true,
  },
  // Mô tả video. Mặc định rỗng.
  description: {
    type: String,
    default: '',
  },
  // Lớp chứa video: ObjectId tham chiếu Class. Bắt buộc.
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  // Người đăng: ObjectId tham chiếu User (giáo viên/admin). Bắt buộc.
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Link video (YouTube, URL mp4...). Bắt buộc vì không lưu file trực tiếp.
  videoUrl: {
    type: String,
    required: true,
  },
  // Thời lượng video (giây). Mặc định 0 nếu chưa đo được.
  duration: {
    type: Number,
    default: 0,
  },
  // Ảnh bìa video. Mặc định null (hiện thumbnail mặc định ở frontend).
  thumbnail: {
    type: String,
    default: null,
  },
  // Tổng lượt xem. Mặc định 0, tăng +1 mỗi khi gọi API view.
  views: {
    type: Number,
    default: 0,
  },
  // Chi tiết lượt xem theo học sinh: mỗi phần tử ghi ai xem, lúc nào, xem bao lâu.
  // - student: ObjectId tham chiếu User (học sinh đã xem).
  // - viewedAt: thời điểm xem.
  // - duration: số giây đã xem (để biết xem hết hay lướt).
  viewedBy: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    viewedAt: Date,
    duration: Number,
  }],
  // Thời điểm đăng video. Mặc định hiện tại.
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

// Xuất model 'Video' để routes dùng: thêm video, đếm view...
module.exports = mongoose.model('Video', videoSchema);
