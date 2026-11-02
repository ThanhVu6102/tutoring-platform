const mongoose = require('mongoose');

// Điểm danh nằm trong buổi học: cập nhật một học sinh là thao tác một document.
// students của lớp là nguồn ghi danh; danh sách dưới đây là snapshot lúc tạo buổi.
const attendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'excused'], default: 'absent' },
  note: { type: String, default: '', maxlength: 2000 },
  checkedInAt: { type: Date, default: null },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const classSessionSchema = new mongoose.Schema({
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, trim: true, maxlength: 255, default: '' },
  location: { type: String, trim: true, maxlength: 1000, default: '' },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  attendances: { type: [attendanceSchema], default: [] },
}, { timestamps: true });

classSessionSchema.path('endsAt').validate(function(value) {
  return value > this.startsAt;
}, 'Thời gian kết thúc phải sau thời gian bắt đầu');
classSessionSchema.path('attendances').validate(function(items) {
  return new Set(items.map((item) => String(item.student))).size === items.length;
}, 'Học sinh bị trùng trong danh sách điểm danh');
classSessionSchema.index({ class: 1, startsAt: 1 });
classSessionSchema.index({ teacher: 1, startsAt: 1, endsAt: 1, status: 1 });

module.exports = mongoose.model('ClassSession', classSessionSchema);
