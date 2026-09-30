// ============================================================================
// FILE: backend/models/Assignment.js
// MỤC ĐÍCH: Định nghĩa collection 'assignments' (bài tập về nhà).
// - Giáo viên giao bài theo lớp, đặt hạn nộp + tổng điểm.
// - Học sinh nộp bài bằng file URL; giáo viên chấm điểm + feedback.
// - Mỗi assignment nhúng mảng submissions (1 phần tử = 1 lượt nộp của 1 học sinh).
// QUAN HỆ: class -> Class, teacher -> User, submissions.student -> User.
// ============================================================================

// Nạp mongoose để định nghĩa schema/model MongoDB.
const mongoose = require('mongoose');

// ----------------------------------------------------------------------------
// SCHEMA CON: submissionSchema (1 lượt nộp bài)
// - Không tạo collection riêng mà nhúng trực tiếp vào assignmentSchema.
// - Mỗi học sinh có thể có 1 phần tử trong mảng submissions.
// ----------------------------------------------------------------------------
const submissionSchema = new mongoose.Schema({
  // Người nộp: ObjectId tham chiếu User (học sinh). Bắt buộc.
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Link file bài làm do học sinh cung cấp (Google Drive, URL...).
  fileUrl: String,
  // Thời điểm nộp. So với dueDate để tính isLate (nộp muộn hay không).
  submittedAt: Date,
  // Cờ nộp muộn: true nếu submittedAt > dueDate.
  isLate: Boolean,
  // Điểm giáo viên chấm (thang theo totalPoints của assignment).
  score: Number,
  // Nhận xét của giáo viên cho bài nộp này.
  feedback: String,
  // Thời điểm chấm xong, dùng để hiển thị lịch sử.
  gradedAt: Date,
});

// Tạo schema chính cho 1 bài tập.
const assignmentSchema = new mongoose.Schema({
  // Tiêu đề bài tập. Bắt buộc (ví dụ: "Bài tập chương 3").
  title: {
    type: String,
    required: true,
  },
  // Mô tả / đề bài chi tiết. Mặc định rỗng.
  description: {
    type: String,
    default: '',
  },
  // Lớp được giao: ObjectId tham chiếu Class. Bắt buộc.
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  // Người giao: ObjectId tham chiếu User (giáo viên/admin). Bắt buộc.
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Hạn nộp. Bắt buộc để tính nộp muộn và khóa nộp sau hạn.
  dueDate: {
    type: Date,
    required: true,
  },
  // Tổng điểm tối đa của bài. Mặc định 100.
  totalPoints: {
    type: Number,
    default: 100,
  },
  // Mảng các lượt nộp (nhúng submissionSchema ở trên).
  submissions: [submissionSchema],
  // Ngày tạo bài tập. Mặc định hiện tại.
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Xuất model 'Assignment' để routes dùng: tạo bài, nộp bài, chấm điểm...
module.exports = mongoose.model('Assignment', assignmentSchema);
