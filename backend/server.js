// ============================================================================
// FILE: backend/server.js
// MỤC ĐÍCH: Khởi tạo Express server, kết nối MongoDB, gắn các nhóm API.
// - Hỗ trợ chạy local (node server.js) và serverless Vercel (cache kết nối).
// - Kết nối DB không tạo hoặc khôi phục tài khoản quản trị.
// - API nghiệp vụ chờ DB; tài liệu Swagger/OpenAPI công khai không cần DB.
// ============================================================================

// Nạp express để tạo web server và định nghĩa middleware/routes.
const express = require('express');
// Nạp mongoose để kết nối và thao tác MongoDB.
const mongoose = require('mongoose');
// Nạp cors để cho phép frontend (domain khác) gọi API backend.
const cors = require('cors');
// Nạp dotenv để đọc biến môi trường từ file .env (MONGODB_URI, JWT_SECRET...).
const dotenv = require('dotenv');
const { cachedConnection } = require('./utils/mongoConnection');

// Đọc file .env vào process.env (nếu có). Trên Vercel thì lấy từ dashboard.
dotenv.config();

// Tạo app Express (trung tâm hứng mọi request).
const app = express();

// Giảm rò rỉ thông tin phiên bản và tránh query lạ ngoài schema.
// (LƯU Ý: phải đặt sau khi khai báo app, trước đó gây ReferenceError khi start.)
app.disable('x-powered-by');
mongoose.set('strictQuery', true);

// ----- Middleware toàn cục -----
// Cho phép mọi domain gọi API (có thể siết lại origin khi lên production).
app.use(cors());
// Tự parse body JSON (frontend gửi axios.post(url, {email, password})).
app.use(express.json({ limit: '7mb' }));
// Cho phép parse form urlencoded dung lượng lớn (tối đa 50mb cho nội dung học liệu).
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/api', require('./middleware/apiPerformance'));
// Tài liệu chỉ là nội dung công khai; vẫn tải được khi database chưa sẵn sàng.
app.use('/api', require('./routes/apiDocs'));

// ----- Cache kết nối MongoDB cho Vercel serverless -----
// Vercel tái sử dụng global giữa các lần gọi nên lưu conn/promise vào global
// để không tạo connection mới mỗi request (tránh quá tải MongoDB).
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// ----------------------------------------------------------------------------
// HÀM: connectDB()
// KẾT NỐI: tới MongoDB và cache lại để tái dùng.
// LUỒNG:
//  - B1: Nếu đã có conn -> trả về ngay (không nối lại).
//  - B2: Nếu chưa có promise nối -> tạo promise mongoose.connect(uri).
//  - B3: Promise chờ kết nối trước khi công bố conn dùng lại.
//  - B4: Lỗi nối -> reset promise về null và ném lỗi cho nơi gọi xử lý.
// ----------------------------------------------------------------------------
const connectDB = cachedConnection(cached,
  () => mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tutoring-platform'));

// ----- Kích hoạt kết nối ban đầu -----
// Nếu chạy trực tiếp bằng 'node server.js' thì nối DB ngay khi khởi động.
if (require.main === module) {
  connectDB().catch((err) => console.log('MongoDB connection error:', err?.message || err));
} else {
  // Nếu được import (Vercel serverless) thì cũng thử nối nền, lỗi thì bỏ qua
  // để không crash lúc cold-start; request tới sẽ nối lại ở middleware /api.
  connectDB().catch(() => {});
}

// ----------------------------------------------------------------------------
// MIDDLEWARE: app.use('/api', ...)
// ĐẢM BẢO: mọi API /api/* đều chờ DB nối xong mới chạy handler tiếp theo.
// - Quan trọng trên Vercel vì mỗi request có thể là 1 instance lạnh chưa có DB.
// - Nếu không nối được -> trả 500 hướng dẫn kiểm tra MONGODB_URI.
// ----------------------------------------------------------------------------
app.use('/api', async (req, res, next) => {
  try {
    // Chờ DB sẵn sàng.
    await connectDB();
    // DB ok -> chuyển tiếp tới router cụ thể (/auth, /users...).
    next();
  } catch (err) {
    // DB lỗi -> chặn request, báo rõ nguyên nhân cho người deploy.
    return res.status(500).json({ message: 'Không kết nối được database. Kiểm tra MONGODB_URI trên Vercel.' });
  }
});

// ----- Health check -----
// API: GET /api/health -> kiểm tra backend còn sống không.
// Mở trên trình duyệt https://domain.vercel.app/api/health phải ra {status:'ok'}.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ----- Gắn các nhóm routes -----
// Mỗi dòng gắn 1 module router vào tiền tố URL tương ứng.
app.use('/api/auth', require('./routes/auth')); // đăng ký/đăng nhập.
app.use('/api/users', require('./routes/users')); // profile + quản trị admin.
app.use('/api/student-warnings', require('./routes/studentWarnings'));
app.use('/api/moderation', require('./routes/moderation')); // phân trang kiểm duyệt dành riêng cho admin.
app.use('/api/classes', require('./routes/classes')); // lớp học.
const sessionRoutes = require('./routes/sessions');
app.use('/api/classes', sessionRoutes.classRouter); // lịch buổi học của lớp.
app.use('/api/sessions', sessionRoutes.sessionRouter); // trạng thái và điểm danh.
app.use('/api/videos', require('./routes/videos')); // video bài giảng.
app.use('/api/documents', require('./routes/documents')); // tài liệu.
app.use('/api/quizzes', require('./routes/quizzes')); // kiểm tra.
app.use('/api/assignments', require('./routes/assignments')); // bài tập.
app.use('/api/announcements', require('./routes/announcements')); // thông báo.

// ----- Bắt route không tồn tại (tránh treo request) -----
app.use((req, res) => {
  res.status(404).json({ message: 'API không tồn tại' });
});

// ----- Xử lý lỗi tập trung -----
// Các route đã tự bắt lỗi; handler này là lưới an toàn cho lỗi phát sinh ngoài
// handler (middleware, JSON hỏng, body quá lớn...) để luôn trả JSON thay vì HTML.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Dữ liệu gửi lên quá lớn' });
  }
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({ message: 'JSON không hợp lệ' });
  }
  console.error('[SERVER ERROR]', err);
  return res.status(500).json({ message: 'Đã có lỗi xảy ra, vui lòng thử lại' });
});

// ----- Khởi động HTTP server khi chạy local -----
// Lấy PORT từ env (mặc định 5000). Chỉ listen khi chạy trực tiếp,
// còn trên Vercel thì export app để platform tự phục vụ.
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  // Lắng nghe cổng và in log để biết server đã lên.
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Xuất app cho Vercel/api/index.js hoặc test require().
module.exports = app;
