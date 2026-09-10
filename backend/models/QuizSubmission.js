const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  answer: String,
  isCorrect: Boolean,
  pointsEarned: {
    type: Number,
    default: 0,
  },
});

const quizSubmissionSchema = new mongoose.Schema({
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  answers: [answerSchema],
  totalScore: {
    type: Number,
    default: 0,
  },
  maxScore: {
    type: Number,
    required: true,
  },
  percentage: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'graded'],
    default: 'in-progress',
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  submittedAt: Date,
  gradedAt: Date,
  feedback: String,
});

module.exports = mongoose.model('QuizSubmission', quizSubmissionSchema);
