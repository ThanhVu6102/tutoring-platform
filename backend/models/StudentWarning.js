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
  // Danh tính lấy từ phiên đăng nhập; hồ sơ cũ không bị gán người xử lý giả.
  appealedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
// Chọn pending đã hết hạn bằng khoảng thời gian, tránh quét mọi cảnh báo
// ngay cả khi không có hồ sơ nào cần xác nhận. Giữ index nghiệp vụ cũ phía trên.
studentWarningSchema.index({ status: 1, appealDeadline: 1 });
// Danh sách admin và lịch sử chính chủ dùng thứ tự phát hành; _id hỗ trợ
// khóa phụ nếu bổ sung phân trang ổn định sau này, không đổi sort/API hiện tại.
studentWarningSchema.index({ issuedAt: -1, _id: -1 });
studentWarningSchema.index({ student: 1, issuedAt: -1, _id: -1 });

module.exports = mongoose.model('StudentWarning', studentWarningSchema);
