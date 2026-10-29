function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function objectId(value, name = 'ID') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    fail(400, `${name} không hợp lệ`);
  }
  return value;
}

function text(value, max, name) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max) fail(400, `${name} không hợp lệ`);
  return value.trim();
}

function sessionInput(body) {
  const parseDate = (value) => {
    // Buộc có múi giờ để không phụ thuộc timezone của máy deploy.
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      fail(400, 'Thời gian phải theo ISO 8601 và có múi giờ');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) fail(400, 'Thời gian không hợp lệ');
    // JavaScript tự đổi 30/02 sang tháng 3; từ chối thay vì âm thầm đổi lịch.
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() + 1 !== month || calendarDate.getUTCDate() !== day || value.slice(11, 13) === '24') {
      fail(400, 'Ngày hoặc giờ không hợp lệ');
    }
    return date;
  };
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  if (endsAt <= startsAt) fail(400, 'Thời gian kết thúc phải sau thời gian bắt đầu');
  return { startsAt, endsAt, title: text(body.title, 255, 'Tiêu đề'), location: text(body.location, 1000, 'Địa điểm') };
}

function pagination(query) {
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
      fail(400, 'Tham số phân trang không hợp lệ');
    }
    return Number(value);
  };
  return { page: integer(query.page, 1, 100000), limit: integer(query.limit, 20, 100) };
}

module.exports = { fail, objectId, text, sessionInput, pagination };
