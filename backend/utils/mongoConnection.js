// Một promise bao trọn kết nối và bước khởi tạo tùy chọn cho cold-start.
function cachedConnection(state, connect, initialize = async () => {}, onInitializeError = () => {}) {
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
