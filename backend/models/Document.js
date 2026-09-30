// ============================================================================
// FILE: backend/models/Document.js
// MỤC ĐÍCH: Định nghĩa collection 'documents' (tài liệu học tập theo URL).
// - Backend chỉ lưu metadata (tiêu đề, link file, loại, dung lượng), không
//   lưu file trực tiếp (file do client upload nơi khác rồi dán URL).
// - Đếm lượt tải (downloads) để giáo viên biết mức độ sử dụng.
// QUAN HỆ: class -> Class, teacher -> User.
// ============================================================================

// Nạp mongoose để định nghĩa schema/model MongoDB.
const mongoose = require('mongoose');

// Tạo schema cho 1 tài liệu.
const documentSchema = new mongoose.Schema({
  // Tiêu đề tài liệu. Bắt buộc (ví dụ: "Đề cương chương 2").
  title: {
    type: String,
    required: true,
  },
  // Mô tả ngắn. Mặc định rỗng.
  description: {
    type: String,
    default: '',
  },
  // Lớp chứa tài liệu: ObjectId tham chiếu Class. Bắt buộc.
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
  // Link file (Google Drive, URL...). Bắt buộc vì backend không lưu file.
  fileUrl: {
    type: String,
    required: true,
  },
  // Định dạng file. Bắt buộc, chỉ nhận các giá trị trong enum để frontend
  // hiện icon đúng (pdf/doc/ppt...). Muốn thêm loại mới thì mở rộng enum.
  fileType: {
    type: String,
    enum: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip'],
    required: true,
  },
  // Dung lượng file (byte) do client khai báo. Mặc định 0 nếu không rõ.
  fileSize: {
    type: Number,
    default: 0,
  },
  // Số lượt tải. Mặc định 0, tăng +1 mỗi khi gọi API download.
  downloads: {
    type: Number,
    default: 0,
  },
  // Thời điểm đăng tài liệu. Mặc định hiện tại.
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

// Xuất model 'Document' để routes dùng: thêm tài liệu, đếm lượt tải...
module.exports = mongoose.model('Document', documentSchema);
