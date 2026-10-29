// ============================================================================
// FILE: backend/utils/respond.js
// MỤC ĐÍCH: Chuẩn hóa phản hồi lỗi cho toàn bộ API.
// - Biến lỗi kỹ thuật (trùng khóa, sai ObjectId, thiếu trường) thành mã HTTP
//   đúng (400/404/409) thay vì luôn trả 500.
// - Không trả chi tiết nội bộ của database ra ngoài, chỉ ghi log phía server.
// ============================================================================

// ----------------------------------------------------------------------------
// HÀM: sendError(res, error, fallbackMessage)
// NHIỆM VỤ: Gửi lỗi đã được phân loại về client.
// ----------------------------------------------------------------------------
function sendError(res, error, fallbackMessage = 'Đã có lỗi xảy ra, vui lòng thử lại') {
  // Nếu header đã gửi thì không thể đổi status/body nữa.
  if (res.headersSent) return;

  // Lỗi trùng unique index (email, khóa ghép...).
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'dữ liệu';
    return res.status(409).json({ message: `Giá trị ${field} đã tồn tại` });
  }

  // Lỗi Mongoose validation (thiếu trường, sai enum, vượt maxlength...).
  if (error?.name === 'ValidationError') {
    const detail = Object.values(error.errors || {})
      .map((item) => item.message)
      .join('; ');
    return res.status(400).json({
      message: detail ? `Dữ liệu không hợp lệ: ${detail}` : 'Dữ liệu không hợp lệ',
    });
  }

  // Lỗi sai định dạng ObjectId khi findById('abc').
  if (error?.name === 'CastError') {
    return res.status(400).json({ message: 'ID không hợp lệ' });
  }

  // Lỗi không tìm thấy document ở tầng model.
  if (error?.name === 'DocumentNotFoundError') {
    return res.status(404).json({ message: 'Không tìm thấy dữ liệu' });
  }

  // Lỗi không xác định: log đầy đủ phía server, trả thông báo chung cho client.
  console.error('[API ERROR]', error);
  return res.status(500).json({ message: fallbackMessage });
}

module.exports = { sendError };
