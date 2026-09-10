const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  subject: {
    type: String,
    required: true,
  },
  grade: {
    type: String,
    default: '',
  },
  capacity: {
    type: Number,
    default: 50,
  },
  schedule: {
    dayOfWeek: String,
    startTime: String,
    endTime: String,
  },
  thumbnail: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
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

module.exports = mongoose.model('Class', classSchema);
