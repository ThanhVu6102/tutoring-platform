const mongoose = require('mongoose');

async function transaction(callback) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } catch (error) {
    // Không bỏ transaction và chạy lại từng lệnh: có thể tạo dữ liệu không nhất quán.
    if (error.code === 20 || error.codeName === 'IllegalOperation') {
      const unavailable = new Error('Tính năng này cần MongoDB replica set hoặc MongoDB Atlas');
      unavailable.statusCode = 503;
      throw unavailable;
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { transaction };
