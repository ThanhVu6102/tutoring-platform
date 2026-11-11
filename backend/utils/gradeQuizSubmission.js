const Quiz = require('../models/Quiz');
const Class = require('../models/Class');
const QuizSubmission = require('../models/QuizSubmission');
const { objectId, fail } = require('./sessionValidation');

async function gradeQuizSubmission(quizId, submissionId, actorId, role, body) {
  objectId(quizId, 'quizId');
  objectId(submissionId, 'submissionId');
  if (!['teacher', 'admin'].includes(role)) fail(403, 'Bạn không có quyền chấm bài');
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Dữ liệu không hợp lệ');
  const { questionIndex, score, feedback } = body;
  if (!Number.isSafeInteger(questionIndex) || questionIndex < 0
    || typeof score !== 'number' || !Number.isFinite(score) || score < 0
    || (feedback !== undefined && typeof feedback !== 'string')) {
    fail(400, 'Chỉ số câu hỏi, điểm hoặc nhận xét không hợp lệ');
  }
  const quiz = await Quiz.findById(quizId).select('class questions');
  if (!quiz) fail(404, 'Không tìm thấy bài kiểm tra');
  const cls = await Class.findById(quiz.class).select('teacher status');
  if (!cls) fail(404, 'Không tìm thấy lớp học');
  // Quyền theo giáo viên phụ trách lớp hiện tại, không theo role từ body/token.
  if (role !== 'admin') {
    if (String(cls.teacher).toLowerCase() !== actorId.toLowerCase()) fail(403, 'Bạn không có quyền chấm bài của lớp này');
    if (cls.status === 'inactive') fail(423, 'Lớp học này đã bị khóa');
  }
  const question = quiz.questions[questionIndex];
  if (!question || !Number.isFinite(question.points) || score > question.points) {
    fail(400, 'Câu hỏi không tồn tại hoặc điểm vượt quá điểm tối đa của câu');
  }
  // Ràng buộc cả ba định danh trong query trước mọi thay đổi điểm.
  const submission = await QuizSubmission.findOne({ _id: submissionId, quiz: quiz._id, class: quiz.class });
  if (!submission) fail(404, 'Không tìm thấy bài nộp');
  const answer = submission.answers[questionIndex];
  if (!answer || String(answer.questionId) !== String(question._id)) {
    fail(409, 'Câu trả lời không khớp câu hỏi hiện tại; vui lòng tải lại');
  }
  // Không lưu tổng NaN/Infinity hay vượt thang điểm snapshot của bài nộp cũ.
  const scores = submission.answers.map((item, index) => index === questionIndex ? score : item.pointsEarned);
  const totalScore = scores.reduce((sum, points) => sum + points, 0);
  if (scores.some((points) => !Number.isFinite(points) || points < 0)
    || !Number.isFinite(submission.maxScore) || submission.maxScore <= 0
    || !Number.isFinite(totalScore) || totalScore > submission.maxScore) {
    fail(409, 'Thang điểm bài nộp không hợp lệ');
  }
  answer.pointsEarned = score;
  if (feedback !== undefined) submission.feedback = feedback;
  submission.status = 'graded';
  submission.gradedAt = new Date();
  submission.totalScore = totalScore;
  submission.percentage = totalScore / submission.maxScore * 100;
  await submission.save();
}

module.exports = { gradeQuizSubmission };
