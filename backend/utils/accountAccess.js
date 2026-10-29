// Tài khoản cũ trên main chưa có các trường vòng đời; null cũng khớp field thiếu.
// Luôn giữ hiệu lực các chế tài đã có trên main khi xếp lịch/ghi danh.
function activeAccountFilter(now = new Date()) {
  return {
    status: { $in: ['active', null] },
    isBlocked: { $ne: true },
    deletedAt: null,
    permanentlyBanned: { $ne: true },
    $or: [{ suspendedUntil: null }, { suspendedUntil: { $lte: now } }],
  };
}

module.exports = { activeAccountFilter };
