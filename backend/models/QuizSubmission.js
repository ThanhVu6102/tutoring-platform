// ============================================================================
// FILE: backend/models/QuizSubmission.js
// MỤC ĐÍCH: Định nghĩa collection 'quizsubmissions' (bài làm của học sinh).
// - Mỗi document = 1 lượt thi của 1 học sinh cho 1 đề quiz.
// - Lưu chi tiết từng câu trả lời, điểm từng câu, tổng điểm, phần trăm.
// - Theo dõi vòng đời: in-progress (đang làm) -> submitted (đã nộp) ->
//   graded (đã chấm).
// QUAN HỆ: quiz -> Quiz, student -> User, class -> Class.
// ============================================================================

// Nạp mongoose để định nghĩa schema/model MongoDB.
const mongoose = require('mongoose');

// ----------------------------------------------------------------------------
// SCHEMA CON: answerSchema (trả lời cho 1 câu hỏi)
// - Nhúng vào mảng answers của submission.
// ----------------------------------------------------------------------------
const answerSchema = new mongoose.Schema({
  // _id của câu hỏi trong Quiz.questions mà câu trả lời này ứng với.
  // Bắt buộc để đối chiếu đáp án đúng.
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  // Nội dung học sinh trả lời (chuỗi). Trắc nghiệm lưu index đã chọn.
  answer: String,
  // Đúng hay sai (auto chấm cho trắc nghiệm/short-answer, tay cho essay).
  isCorrect: Boolean,
  // Điểm đạt được cho câu này. Mặc định 0.
  pointsEarned: {
    type: Number,
    default: 0,
  },
});

// Tạo schema chính cho 1 lượt nộp bài.
const quizSubmissionSchema = new mongoose.Schema({
  // Đề thi: ObjectId tham chiếu Quiz. Bắt buộc.
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true,
  },
  // Học sinh làm bài: ObjectId tham chiếu User. Bắt buộc.
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Lớp của đề thi: ObjectId tham chiếu Class. Bắt buộc (để lọc theo lớp).
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  // Mảng câu trả lời (nhúng answerSchema ở trên).
  answers: [answerSchema],
  // Tổng điểm đạt được (tổng pointsEarned). Mặc định 0.
  totalScore: {
    type: Number,
    default: 0,
  },
  // Điểm tối đa của đề (copy từ quiz.totalPoints lúc bắt đầu). Bắt buộc
  // để tính percentage kể cả khi đề sau này bị sửa điểm.
  maxScore: {
    type: Number,
    required: true,
  },
  // Phần trăm = totalScore / maxScore * 100. Mặc định 0.
  percentage: {
    type: Number,
    default: 0,
  },
  // Trạng thái: in-progress (đang làm, có thể phát hiện chuyển tab) /
  // submitted (đã nộp, chờ chấm essay) / graded (đã có điểm cuối).
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'graded'],
    default: 'in-progress',
  },
  // Thời điểm bắt đầu bấm "Làm bài". Mặc định hiện tại, dùng với timeLimit.
  startedAt: {
    type: Date,
    default: Date.now,
  },
  // Thời điểm bấm nộp (hoặc hệ thống tự nộp khi hết giờ).
  submittedAt: Date,
  // Thời điểm giáo viên chấm xong (nhất là phần tự luận).
  gradedAt: Date,
  // Nhận xét chung của giáo viên cho cả bài làm.
  feedback: String,
});

// Xuất model 'QuizSubmission' để routes dùng: bắt đầu thi, nộp bài, chấm...
module.exports = mongoose.model('QuizSubmission', quizSubmissionSchema);
