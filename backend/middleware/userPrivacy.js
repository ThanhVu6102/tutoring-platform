const { filterUserReferences } = require('../utils/userPrivacy');

// Lọc hồ sơ lồng nhau ngay trước khi gửi JSON, không thay đổi document trong DB
// hay dữ liệu mà handler đang dùng để kiểm tra quyền sở hữu lớp/bài học.
function userPrivacy(req, res, next) {
  const json = res.json;
  res.json = function(body) {
    return json.call(this, filterUserReferences(body, req));
  };
  next();
}

module.exports = userPrivacy;
