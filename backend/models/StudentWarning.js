const mongoose = require('mongoose');

const studentWarningSchema = new mongoose.Schema({
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
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  reasonCode: {
    type: String,
    enum: [
      'spam', 'abusive_content', 'copyright', 'account_sharing', 'academic_fraud',
      'illegal_content', 'privacy_breach', 'financial_misconduct', 'class_disruption', 'other',
    ],
    required: true,
  },
  policyLevel: { type: Number, min: 1, max: 3, required: true },
  details: { type: String, required: true, maxlength: 2000 },
  status: {
    type: String,
    enum: ['pending', 'appealed', 'confirmed', 'dismissed'],
    default: 'pending',
  },
  issuedAt: { type: Date, default: Date.now },
  appealDeadline: { type: Date, required: true },
  appealMessage: { type: String, maxlength: 3000, default: '' },
  appealedAt: Date,
  resolvedAt: Date,
  adminResponse: { type: String, maxlength: 2000, default: '' },
  violationCounted: { type: Boolean, default: false },
  classWarningCount: { type: Number, default: 0 },
  classRemovalApplied: { type: Boolean, default: false },
  accountSanction: {
    type: String,
    enum: ['none', 'suspension_7_days', 'suspension_1_month', 'permanent_ban'],
    default: 'none',
  },
}, { timestamps: true });

studentWarningSchema.index({ student: 1, class: 1, status: 1 });

module.exports = mongoose.model('StudentWarning', studentWarningSchema);