const { fail, objectId, text } = require('./sessionValidation');
const { sendError } = require('./respond');

const validReasons = [
  'spam', 'abusive_content', 'copyright', 'account_sharing', 'academic_fraud',
  'illegal_content', 'privacy_breach', 'financial_misconduct', 'class_disruption', 'other',
];

// Kiểm tra kiểu trước khi trim/cast để JSON sai không thành lỗi 500 hoặc toán tử query.
function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Body phải là một object');
  return body;
}

function id(value, name = 'ID') {
  return objectId(value, name).toLowerCase();
}

function noticeInput(body) {
  const { reasonCode, policyLevel, details } = bodyObject(body);
  if (!validReasons.includes(reasonCode)) fail(400, 'Vui lòng chọn lý do vi phạm hợp lệ');
  // Form cũ gửi cả số và chuỗi số; không chấp nhận boolean, array hoặc object.
  if (![1, 2, 3, '1', '2', '3'].includes(policyLevel)) fail(400, 'Vui lòng chọn mức độ vi phạm từ 1 đến 3');
  const description = text(details, 2000, 'Mô tả');
  if (!description) fail(400, 'Vui lòng nhập mô tả chi tiết, tối đa 2000 ký tự');
  return { reasonCode, policyLevel: Number(policyLevel), details: description };
}

function appealInput(body) {
  const message = text(bodyObject(body).message, 3000, 'Nội dung kháng cáo');
  if (!message) fail(400, 'Vui lòng nhập nội dung kháng cáo, tối đa 3000 ký tự');
  return message;
}

function reviewInput(body, decisions) {
  const { decision, response } = bodyObject(body);
  if (!decisions.includes(decision)) fail(400, `Quyết định phải là ${decisions.join(' hoặc ')}`);
  return { decision, response: text(response, 2000, 'Phản hồi xét duyệt') };
}

// Các route kháng cáo dùng chung mã lỗi nghiệp vụ; lỗi DB còn lại được che bởi sendError.
const handleAppeal = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if ([400, 403, 404, 409, 423, 503].includes(error.statusCode)) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return sendError(res, error);
  }
};

module.exports = { fail, id, bodyObject, noticeInput, appealInput, reviewInput, handleAppeal };
