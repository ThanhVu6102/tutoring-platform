const mongoose = require('mongoose');

// Mọi danh sách đều có giới hạn kể cả khi client không truyền tham số.
function pagination(query = {}) {
  const integer = (value, fallback, max, name) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
      throw Object.assign(new Error(`${name} phải là số nguyên dương`), { statusCode: 400 });
    }
    return Math.min(Number(value), max);
  };
  return { page: integer(query.page, 1, 10000, 'page'), limit: integer(query.limit, 20, 100, 'limit') };
}

function objectId(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw Object.assign(new Error('ID không hợp lệ'), { statusCode: 400 });
  }
  return new mongoose.Types.ObjectId(value);
}

// Chỉ cho phép sort/projection do server định nghĩa; count và dữ liệu dùng cùng filter quyền.
async function readPage(Model, req, filter, { select, projection, sort = { createdAt: -1, _id: -1 }, populate, map,
  countHint, countSummary = false } = {}) {
  const { page, limit } = pagination(req.query);
  let query;
  if (projection) {
    query = Model.aggregate([{ $match: filter }, { $sort: sort }, { $skip: (page - 1) * limit },
      { $limit: limit }, { $project: projection }]);
  } else {
    query = Model.find(filter);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    query = query.sort(sort).skip((page - 1) * limit).limit(limit).lean();
  }
  // Khi contains/history cần summary, gộp ba phép đếm vào một group nhưng vẫn
  // để query trang chạy song song. Không gom payload vào facet hay đọc trang
  // tuần tự sau count (phương án đó đã đo và chậm hơn main).
  let count = countSummary ? Model.aggregate([{ $match: filter }, { $group: {
    _id: '$status', count: { $sum: 1 },
  } }]) : Model.countDocuments(filter);
  // Đếm toàn bộ qua index _id vẫn exact nhưng tránh đọc document đầy đủ; không
  // dùng estimatedDocumentCount và không ép index cho filter không tương thích.
  if (countHint && !countSummary) count = count.hint(countHint);
  let [data, counted] = await Promise.all([query, count]);
  // Cộng cả nhóm status cũ/thiếu vào total, nhưng chỉ hai trạng thái chuẩn vào
  // active/inactive như ba count trước đây; không bỏ bản ghi legacy khỏi tổng.
  const summary = countSummary ? counted.reduce((result, group) => {
    result.total += group.count;
    if (group._id === 'active' || group._id === 'inactive') result[group._id] += group.count;
    return result;
  }, { total: 0, active: 0, inactive: 0 }) : undefined;
  const total = countSummary ? summary.total : counted;
  if (projection && populate) data = await Model.populate(data, populate);
  if (map) data = data.map(map);
  return { data, page, limit, total, totalPages: Math.ceil(total / limit), ...(summary ? { summary } : {}) };
}

module.exports = { pagination, readPage, objectId };
