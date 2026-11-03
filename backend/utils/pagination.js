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
async function readPage(Model, req, filter, { select, projection, sort = { createdAt: -1, _id: -1 }, populate, map } = {}) {
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
  let [data, total] = await Promise.all([query, Model.countDocuments(filter)]);
  if (projection && populate) data = await Model.populate(data, populate);
  if (map) data = data.map(map);
  return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = { pagination, readPage, objectId };
