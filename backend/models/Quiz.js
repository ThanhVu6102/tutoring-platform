// ============================================================================
// FILE: backend/models/Quiz.js
// MỤC ĐÍCH: Định nghĩa collection 'quizzes' (đề kiểm tra) + schema con câu hỏi.
// - Giáo viên tạo đề theo lớp, gồm nhiều câu hỏi nhúng trực tiếp.
// - Hỗ trợ 3 dạng câu hỏi: trắc nghiệm, tự luận, trả lời ngắn.
// - Cấu hình thi: tổng điểm, giới hạn giờ, hạn nộp, xáo trộn, cho xem lại...
// QUAN HỆ: class -> Class, teacher -> User.
// ============================================================================

// Nạp mongoose để định nghĩa schema/model MongoDB.
const mongoose = require('mongoose');

// ----------------------------------------------------------------------------
// SCHEMA CON: questionSchema (1 câu hỏi trong đề)
// - Nhúng trực tiếp vào mảng questions của quiz, không tách collection.
// ----------------------------------------------------------------------------
const questionSchema = new mongoose.Schema({
  // Dạng câu hỏi, chỉ nhận 3 giá trị:
  //  + 'multiple-choice': trắc nghiệm (có options).
  //  + 'essay': tự luận (chấm tay).
  //  + 'short-answer': trả lời ngắn (so chuỗi).
  type: {
    type: String,
    enum: ['multiple-choice', 'essay', 'short-answer'],
    required: true,
  },
  // Nội dung câu hỏi. Bắt buộc (ví dụ: "2 + 2 = ?").
  question: {
    type: String,
    required: true,
  },
  // Các lựa chọn cho trắc nghiệm (mảng chuỗi). Tự luận/bỏ trống thì để rỗng.
  options: [String],
  // Đáp án đúng (lưu index dạng chuỗi cho trắc nghiệm, hoặc chuỗi đáp án
  // cho short-answer). Essay thì để trống vì giáo viên chấm tay.
  correctAnswer: String,
  // Số điểm của câu này. Mặc định 1 điểm.
  points: {
    type: Number,
    default: 1,
  },
});

// Tạo schema chính cho 1 đề kiểm tra.
const quizSchema = new mongoose.Schema({
  // Tiêu đề đề. Bắt buộc (ví dụ: "Kiểm tra 15 phút chương 1").
  title: {
    type: String,
    required: true,
  },
  // Mô tả / hướng dẫn làm bài. Mặc định rỗng.
  description: {
    type: String,
    default: '',
  },
  // Lớp áp dụng: ObjectId tham chiếu Class. Bắt buộc.
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  // Người ra đề: ObjectId tham chiếu User (giáo viên/admin). Bắt buộc.
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Mảng câu hỏi (nhúng questionSchema ở trên).
  questions: [questionSchema],
  // Tổng điểm đề (thường = tổng points các câu). Mặc định 0, tính khi tạo.
  totalPoints: {
    type: Number,
    default: 0,
  },
  // Giới hạn thời gian làm bài (phút). Mặc định null = không giới hạn.
  // Frontend dùng để đếm ngược và tự nộp khi hết giờ.
  timeLimit: {
    type: Number,
    default: null,
  },
  // Hạn nộp bài. Quá hạn thì chặn submit.
  dueDate: Date,
  // Có cho học sinh xem lại đáp án sau khi nộp không. Mặc định true.
  allowReview: {
    type: Boolean,
    default: true,
  },
  // Có xáo trộn thứ tự câu hỏi mỗi lượt thi không. Mặc định false.
  shuffleQuestions: {
    type: Boolean,
    default: false,
  },
  // Trạng thái đề: draft (nháp) / published (đã giao) / closed (đã đóng).
  // Mặc định 'draft'.
  status: {
    type: String,
    enum: ['draft', 'published', 'closed'],
    default: 'draft',
  },
  // Ngày tạo đề. Mặc định hiện tại.
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Ngày sửa cuối. API PUT tự gán lại.
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Xuất model 'Quiz' để routes dùng: tạo đề, lấy đề, chấm auto trắc nghiệm...
module.exports = mongoose.model('Quiz', quizSchema);
