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
//  - B3: Promise chờ cả kết nối và khởi tạo admin trước khi công bố conn dùng lại.
//  - B4: Lỗi nối -> reset promise về null và ném lỗi cho nơi gọi xử lý.
// ----------------------------------------------------------------------------
const connectDB = cachedConnection(cached,
  () => mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tutoring-platform'),
  () => require('./utils/superAdmin').ensureSuperAdmin(),
  () => console.log('Ensure super admin skipped'));

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

// ----- Tài liệu API rút gọn -----
// API: GET /api/docs -> trả JSON liệt kê các endpoint chính để frontend tra cứu.
app.get('/api/docs', (req, res) => {
  // Chỉ cache tài liệu công khai; API tài khoản/lớp vẫn private, no-store.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.json({
    name: 'Tutoring Platform API',
    version: '1.0.0',
    baseURL: process.env.API_URL || 'http://localhost:5000',
    // Contract dùng chung cho bảy endpoint danh sách chính ở BE #04.
    pagination: {
      defaultLimit: 20, maxLimit: 100, maxPage: 10000,
      response: '{ data: [], page, limit, total, totalPages }',
      scope: ['classes', 'users', 'videos/class/:classId', 'documents/class/:classId',
        'assignments/class/:classId', 'announcements/class/:classId', 'quizzes/class/:classId'],
    },
    endpoints: {
      auth: {
        register: 'POST /api/auth/register', // đăng ký student/teacher.
        login: 'POST /api/auth/login', // đăng nhập, super admin luôn vào được.
        logout: 'POST /api/auth/logout' // (frontend tự xóa token).
      },
      users: {
        changePassword: 'PATCH /api/users/password (chính chủ, body: {currentPassword, newPassword})',
        list: 'GET /api/users (admin)', // admin xem toàn bộ user.
        updateRole: 'PUT /api/users/:id/role (admin, body: {role})', // cấp/thu hồi admin.
        delete: 'DELETE /api/users/:id (admin, không xóa được super admin)' // xóa user.
      },
      classes: {
        create: 'POST /api/classes', // giáo viên/admin tạo lớp.
        getAll: 'GET /api/classes?page=1&limit=20&search=&subject=&grade=&status=', // danh sách phân trang.
        contentSummary: 'GET /api/classes/:id/content-summary (theo quyền lớp)',
        getById: 'GET /api/classes/:id', // chi tiết 1 lớp.
        update: 'PUT /api/classes/:id', // sửa lớp.
        delete: 'DELETE /api/classes/:id', // xóa lớp.
        enroll: 'POST /api/classes/:id/enroll', // thêm học sinh bằng email.
        getStudents: 'GET /api/classes/:id/students', // danh sách học sinh.
        lookupByCode: 'GET /api/classes/lookup/:joinCode',
        requestToJoin: 'POST /api/classes/join/:joinCode/request',
        reviewJoinRequest: 'PATCH /api/classes/:id/join-requests/:studentId',
        lockNotice: 'PATCH /api/classes/:id/lock-notice (admin, body: {reasonCode, policyLevel, details})',
        lockAppeal: 'POST /api/classes/:id/lock-appeal (giáo viên phụ trách, body: {message}, hạn 24 giờ)',
        lockReview: 'PATCH /api/classes/:id/lock-review (admin, body: {decision: lock|dismiss, response?})',
        reopen: 'PATCH /api/classes/:id/status (admin, body: {status: active})'
      },
      // Hai luồng kháng cáo hiện có; danh sách cảnh báo vẫn trả mảng để tương thích UI.
      studentWarnings: {
        issue: 'POST /api/student-warnings/:studentId (admin, body: {classId, reasonCode, policyLevel, details})',
        mine: 'GET /api/student-warnings/mine (học sinh, mảng cảnh báo của chính mình)',
        list: 'GET /api/student-warnings?status=pending|appealed|confirmed|dismissed (admin)',
        appeal: 'POST /api/student-warnings/:warningId/appeal (chính chủ, body: {message}, hạn 7 ngày)',
        review: 'PATCH /api/student-warnings/:warningId/review (admin, body: {decision: confirm|dismiss, response?})',
        transaction: 'Xác nhận vi phạm và xử lý hết hạn cần MongoDB replica set/Atlas',
      },
      moderation: {
        summary: 'GET /api/moderation/summary (admin, exact totals)',
        warnings: 'GET /api/moderation/warnings?page=1&limit=20&status=appealed (admin)',
        students: 'GET /api/moderation/students?page=1&limit=20 (admin)',
        classes: 'GET /api/moderation/classes?page=1&limit=20 (admin)',
      },
      sessions: {
        create: 'POST /api/classes/:id/sessions (giáo viên phụ trách/admin)',
        list: 'GET /api/classes/:id/sessions?page=1&limit=20',
        detail: 'GET /api/sessions/:id',
        updateStatus: 'PUT /api/sessions/:id/status (body: {status})',
        attendances: 'GET /api/sessions/:id/attendances',
        checkIn: 'POST /api/sessions/:id/check-in (body: {student_id, status, note})'
      },
      quizzes: {
        create: 'POST /api/quizzes', // tạo bài kiểm tra.
        getAll: 'GET /api/quizzes', // lấy danh sách.
        submit: 'POST /api/quizzes/:id/submit' // nộp bài.
      }
    }
  });
});

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
