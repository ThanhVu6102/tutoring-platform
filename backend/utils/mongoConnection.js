// Một promise bao trọn kết nối và khởi tạo; các request cold-start không cùng
// chạy ensureSuperAdmin nhiều lần sau khi chỉ chờ chung mongoose.connect.
function cachedConnection(state, connect, initialize, onInitializeError = () => {}) {
  return async function connectDB() {
    if (state.conn) return state.conn;
    if (!state.promise) {
      state.promise = Promise.resolve().then(connect).then(async (connection) => {
        try { await initialize(); } catch (error) { onInitializeError(error); }
        state.conn = connection;
        return connection;
      }).catch((error) => {
        state.conn = null;
        state.promise = null;
        throw error;
      });
    }
    return state.promise;
  };
}

module.exports = { cachedConnection };
