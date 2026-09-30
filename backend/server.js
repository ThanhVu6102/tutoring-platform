// ============================================================================
// FILE: backend/server.js
// MỤC ĐÍCH: Khởi tạo Express server, kết nối MongoDB, gắn các nhóm API.
// - Hỗ trợ chạy local (node server.js) và serverless Vercel (cache kết nối).
// - Tự đảm bảo Super Admin gốc tồn tại sau mỗi lần nối DB.
// - Mọi request /api/* đều chờ DB nối xong mới xử lý để chống cold-start fail.
// ============================================================================

// Nạp express để tạo web server và định nghĩa middleware/routes.
const express = require('express');
// Nạp mongoose để kết nối và thao tác MongoDB.
const mongoose = require('mongoose');
// Nạp cors để cho phép frontend (domain khác) gọi API backend.
const cors = require('cors');
// Nạp dotenv để đọc biến môi trường từ file .env (MONGODB_URI, JWT_SECRET...).
const dotenv = require('dotenv');

// Đọc file .env vào process.env (nếu có). Trên Vercel thì lấy từ dashboard.
dotenv.config();

// Tạo app Express (trung tâm hứng mọi request).
const app = express();

// ----- Middleware toàn cục -----
// Cho phép mọi domain gọi API (có thể siết lại origin khi lên production).
app.use(cors());
// Tự parse body JSON (frontend gửi axios.post(url, {email, password})).
app.use(express.json());
// Cho phép parse form urlencoded dung lượng lớn (tối đa 50mb cho nội dung học liệu).
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
//  - B3: Chờ promise xong -> lưu conn, rồi gọi ensureSuperAdmin() để
//         tự tạo/khôi phục Super Admin gốc (không cần seed tay).
//  - B4: Lỗi nối -> reset promise về null và ném lỗi cho nơi gọi xử lý.
// ----------------------------------------------------------------------------
async function connectDB() {
  // B1: Đã nối rồi thì dùng lại ngay.
  if (cached.conn) return cached.conn;
  // B2: Chưa nối thì tạo 1 promise nối duy nhất, các request khác chờ chung.
  if (!cached.promise) {
    // Lấy URI từ env, fallback localhost khi chạy local.
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tutoring-platform';
    // Bắt đầu nối, khi xong in log để biết DB sống.
    cached.promise = mongoose.connect(uri).then((m) => {
      console.log('MongoDB connected');
      return m;
    });
  }
  try {
    // B3a: Chờ kết nối hoàn tất rồi cache lại.
    cached.conn = await cached.promise;
    // B3b: Tự đảm bảo Super Admin gốc luôn tồn tại sau khi có DB.
    try {
      // Nạp hàm ensure trong try để không crash server nếu model lỗi.
      const { ensureSuperAdmin } = require('./utils/superAdmin');
      // Tạo/khôi phục admin@eklasses.vn / Admin123! nếu thiếu/sai.
      await ensureSuperAdmin();
    } catch (e) {
      // Bỏ qua lỗi ensure (vẫn cho server chạy, chỉ in log).
      console.log('Ensure super admin skipped:', e?.message || e);
    }
  } catch (err) {
    // B4: Nối thất bại -> xóa promise để lần sau thử lại từ đầu.
    cached.promise = null;
    console.log('MongoDB connection error:', err?.message || err);
    throw err;
  }
  return cached.conn;
}

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
app.use('/api/classes', require('./routes/classes')); // lớp học.
app.use('/api/videos', require('./routes/videos')); // video bài giảng.
app.use('/api/documents', require('./routes/documents')); // tài liệu.
app.use('/api/quizzes', require('./routes/quizzes')); // kiểm tra.
app.use('/api/assignments', require('./routes/assignments')); // bài tập.
app.use('/api/announcements', require('./routes/announcements')); // thông báo.

// ----- Tài liệu API rút gọn -----
// API: GET /api/docs -> trả JSON liệt kê các endpoint chính để frontend tra cứu.
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'Tutoring Platform API',
    version: '1.0.0',
    baseURL: process.env.API_URL || 'http://localhost:5000',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register', // đăng ký student/teacher.
        login: 'POST /api/auth/login', // đăng nhập, super admin luôn vào được.
        logout: 'POST /api/auth/logout' // (frontend tự xóa token).
      },
      users: {
        list: 'GET /api/users (admin)', // admin xem toàn bộ user.
        updateRole: 'PUT /api/users/:id/role (admin, body: {role})', // cấp/thu hồi admin.
        delete: 'DELETE /api/users/:id (admin, không xóa được super admin)' // xóa user.
      },
      classes: {
        create: 'POST /api/classes', // giáo viên/admin tạo lớp.
        getAll: 'GET /api/classes', // lấy danh sách lớp.
        getById: 'GET /api/classes/:id', // chi tiết 1 lớp.
        update: 'PUT /api/classes/:id', // sửa lớp.
        delete: 'DELETE /api/classes/:id', // xóa lớp.
        enroll: 'POST /api/classes/:id/enroll', // thêm học sinh bằng email.
        getStudents: 'GET /api/classes/:id/students' // danh sách học sinh.
      },
      quizzes: {
        create: 'POST /api/quizzes', // tạo bài kiểm tra.
        getAll: 'GET /api/quizzes', // lấy danh sách.
        submit: 'POST /api/quizzes/:id/submit' // nộp bài.
      }
    }
  });
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
