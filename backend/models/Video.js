const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
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
  videoUrl: {
    type: String,
    required: true,
  },
  duration: {
    type: Number, // in seconds
    default: 0,
  },
  thumbnail: {
    type: String,
    default: null,
  },
  views: {
    type: Number,
    default: 0,
  },
  viewedBy: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    viewedAt: Date,
    duration: Number,
  }],
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Video', videoSchema);
