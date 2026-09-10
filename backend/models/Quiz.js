const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['multiple-choice', 'essay', 'short-answer'],
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  options: [String], // For multiple-choice
  correctAnswer: String, // Index for multiple-choice
  points: {
    type: Number,
    default: 1,
  },
});

const quizSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  questions: [questionSchema],
  totalPoints: {
    type: Number,
    default: 0,
  },
  timeLimit: {
    type: Number, // in minutes
    default: null,
  },
  dueDate: Date,
  allowReview: {
    type: Boolean,
    default: true,
  },
  shuffleQuestions: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'closed'],
    default: 'draft',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Quiz', quizSchema);
