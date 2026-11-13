# EKLASSES - NỀN TẢNG QUẢN LÝ LỚP HỌC TRỰC TUYẾN (TUTORING PLATFORM)

Chào mừng bạn đến với **EKLASSES** - nền tảng quản lý lớp học trực tuyến cho giáo viên tự do và gia sư, tích hợp đầy đủ **lớp học, video bài giảng, tài liệu, bài kiểm tra trắc nghiệm, bài tập và thông báo** trong một hệ thống duy nhất với 3 phân quyền **Admin / Giáo viên / Học sinh**.

Tài liệu kỹ thuật và hướng dẫn liên quan được tập trung tại [docs/README.md](docs/README.md).

Tra cứu nhanh: [quản lý tài khoản](docs/ADMIN_ACCOUNTS.md), [hồ sơ và mật khẩu](docs/USER_PRIVACY.md), [bảo mật](docs/BACKEND_SECURITY.md), [hiệu năng](docs/PERFORMANCE.md). Trạng thái issue, phiên bản phát hành và việc còn lại nằm riêng tại [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md); chức năng trên source không mặc nhiên đã có trên production.

---

## 0. LIÊN KẾT WEBSITE (WEBSITE LINKS)

| Môi trường | Địa chỉ | Ghi chú |
|------------|---------|---------|
| Production (Vercel) | https://tutoring-platform-pi-beige.vercel.app | Frontend + API chung một domain |
| Health check (production) | https://tutoring-platform-pi-beige.vercel.app/api/health | Kiểm tra backend; không thay kiểm chứng đăng nhập/database |
| API docs (production) | https://tutoring-platform-pi-beige.vercel.app/api/docs | Danh sách endpoint rút gọn, không phải OpenAPI đầy đủ |
| Local frontend | `http://localhost:3000` | Chạy bằng `npm start --prefix frontend` |
| Local backend | `http://localhost:5000` | Chạy bằng `npm run dev --prefix backend` |
| Health check (local) | `http://localhost:5000/api/health` | Phải trả về `{"status":"ok"}` |

---

## 0.1. TÀI KHOẢN QUẢN TRỊ

Không có mật khẩu admin mặc định hoặc bypass bằng biến môi trường. Mọi tài khoản đăng nhập bằng mật khẩu đã hash trong MongoDB và phải đáp ứng kiểm tra trạng thái tài khoản.

Admin mới được tạo thủ công qua `npm run seed:admin --prefix backend` với `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` tường minh (mật khẩu ngẫu nhiên ít nhất 16 ký tự, tối đa 72 byte UTF-8). Lệnh chỉ tạo mới, không reset/mở khóa/nâng quyền tài khoản đã tồn tại. Kết nối DB không tự bootstrap.

Danh tính gốc `admin@eklasses.vn` vẫn được bảo vệ khỏi đăng ký public, xóa/hạ quyền, nhưng không được bỏ qua kiểm tra mật khẩu/trạng thái. Admin có thể đổi mật khẩu tại hồ sơ.

**Môi trường cũ phải xoay vòng mật khẩu từng công khai và đánh giá thu hồi phiên**; chỉ cập nhật code không thay hash cũ hoặc token đã cấp. Xem quy trình và checklist vận hành trong [docs/ADMIN_BOOTSTRAP.md](docs/ADMIN_BOOTSTRAP.md).

---

## 1. KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

Hệ thống chạy theo mô hình **Client-Server**, deploy fullstack trên cùng một domain Vercel (frontend + serverless API), dữ liệu lưu trên MongoDB Atlas.

```mermaid
graph TD
    User([Người dùng / Học sinh / Giáo viên / Admin]) -->|Truy cập HTTPS| Vercel[Vercel - Fullstack]
    Vercel -->|Static| FE[Frontend React CRA - /]
    Vercel -->|Rewrite /api/*| API[Serverless Function api/index.js - Express]
    API -->|Mongoose| DB[(MongoDB Atlas)]
    FE -->|Axios + JWT Bearer| API
```

### 1.1. Công nghệ Frontend (Create React App)
* **Framework chính:** React 18 + React Router v6; các trang quản trị và nội dung nặng dùng lazy loading.
* **Gọi API:** Axios tập trung tại `src/config/api.js` — tự đọc `REACT_APP_API_URL`, tự gắn `Authorization: Bearer <token>` cho mọi request.
* **Bài giảng video:** `react-player` phát video theo URL.
* **Thống kê:** `recharts` vẽ biểu đồ (điểm số, tiến độ học tập).
* **Styling:** `src/styles/App.css` và CSS riêng cho một số component/trang; giao diện tiếng Việt, thương hiệu EKLASSES.

### 1.2. Công nghệ Backend & Database
* **Runtime Environment:** Node.js v18+ kết hợp Express framework (`backend/server.js`, export `app` để vừa chạy local `node server.js` vừa chạy serverless trên Vercel qua `api/index.js`).
* **Cơ sở dữ liệu:** MongoDB (Mongoose v7), lưu trên MongoDB Atlas khi deploy, Mongo local khi dev.
* **Kết nối serverless:** Cache connection `global.mongoose` + middleware đảm bảo `connectDB()` trước mọi request `/api/*` (chống cold-start fail).
* **Bảo mật & Mã hóa:** Xác thực JWT (Bearer token, hết hạn 7 ngày) qua `authMiddleware`; phân quyền `teacherOnly` (giáo viên + admin) và `adminOnly`; mật khẩu hash bằng bcryptjs (pre-save hook + `comparePassword`).
* **Tài liệu/Video:** Lưu theo URL (`fileUrl`, `videoUrl`) do client cung cấp, backend chỉ lưu metadata (không upload file trực tiếp).

---

## 2. CÁC TÍNH NĂNG CHÍNH (KEY FEATURES)

### 2.1. Xác thực & Phân quyền (`/login`, `/register`)
* Đăng ký 2 vai trò public: **Học sinh / Giáo viên** (đăng ký `admin` và email admin gốc bị chặn ở backend).
* Học sinh được kích hoạt khi đăng ký; giáo viên ở trạng thái chờ duyệt, chưa được cấp token cho đến khi admin duyệt.
* Đăng nhập trả về JWT + `{ id, name, email, role }`, lưu `token/userId/userRole` vào localStorage.
* Backend lấy vai trò/trạng thái hiện tại từ database để kiểm tra quyền, không chỉ dựa vào role trên trình duyệt hoặc token cũ.
* Admin dùng mật khẩu/trạng thái trong DB như mọi role; không có nhánh đăng nhập ưu tiên từ cấu hình.
* `ADMIN_EMAIL` + `ADMIN_PASSWORD` (tùy chọn `ADMIN_NAME`) chỉ dùng cho bootstrap thủ công; không ghi đè mật khẩu đã đổi.
* Tạo admin mới: `npm run seed:admin --prefix backend` với cấu hình tường minh theo mục 0.1; email đã tồn tại sẽ bị từ chối, không khôi phục tự động.

### 2.2. Dashboard (`/dashboard`)
* Giáo viên: xem lớp mình dạy + tạo lớp mới (tên, mô tả, môn, khối).
* Học sinh: xem các lớp đã tham gia.
* Admin dùng `/admin` để quản lý danh sách lớp, tìm kiếm, lọc và phân trang toàn hệ thống.

### 2.3. Chi tiết lớp học (`/class/:id`)
* Các tab Tổng quan, Video, Tài liệu, Kiểm tra, Bài tập, Thông báo; tab Học sinh dành cho giáo viên/admin.
* Giáo viên: thêm học sinh bằng email (`POST /api/classes/:id/enroll`), đăng thông báo theo độ ưu tiên (`low/normal/high`).
* Học sinh: xem nội dung, nộp bài.

### 2.4. Làm bài kiểm tra (`/quiz/:quizId/take`) — chống gian lận
* Đếm ngược `timeLimit` (phút), hết giờ tự nộp.
* Phát hiện chuyển tab (`visibilitychange`) và cảnh báo.
* Hỗ trợ 3 dạng câu hỏi: trắc nghiệm (`multiple-choice`), tự luận (`essay`), trả lời ngắn (`short-answer`); chấm điểm + lưu lịch sử nộp bài.

### 2.5. Quản lý nội dung (Giáo viên)
* **Video:** thêm video theo URL + thumbnail, đếm lượt xem theo học sinh (`POST /api/videos/:id/view`).
* **Tài liệu:** thêm tài liệu theo URL + loại/dung lượng file, đếm lượt tải (`POST /api/documents/:id/download`).
* **Bài tập:** giao bài có hạn nộp + tổng điểm, học sinh nộp file URL, giáo viên chấm điểm + feedback.
* Tab **Bài tập** có khung nộp/xem kết quả chính chủ và chấm bài cho giáo viên phụ trách/admin; danh sách chỉ tải metadata. URL chỉ nhận HTTP(S), điểm trong thang của bài; xem [quyền truy cập và kiểm thử](docs/BACKEND_SECURITY.md).
* **Thông báo:** đăng thông báo theo lớp, theo dõi ai đã đọc (`readBy`).

### 2.6. Hồ sơ, mật khẩu và quyền riêng tư (`/profile`)

* Mọi vai trò cập nhật hồ sơ và đổi mật khẩu chính chủ tại `/profile`; hai form lưu riêng, không gửi mật khẩu cùng cập nhật hồ sơ.
* Đổi mật khẩu yêu cầu mật khẩu hiện tại, mật khẩu mới và nhập lại. Mật khẩu mới ít nhất 8 ký tự, tối đa 72 byte UTF-8; xóa các ô sau thành công, không lưu mật khẩu vào storage.
* JWT đã cấp vẫn có hiệu lực tới hạn; đổi mật khẩu chưa tự đăng xuất các phiên khác.

Dữ liệu hồ sơ được lọc **ở backend trước khi gửi response**, không chỉ ẩn trên giao diện:

| Người xem | Dữ liệu hồ sơ được nhận |
|-----------|-------------------------|
| Người khác đã đăng nhập | ID (`_id`/`id`), tên, vai trò, avatar và bio nếu có trong dữ liệu nguồn |
| Chính chủ | Giữ thông tin hiện có của mình, gồm email, số điện thoại, lớp, trạng thái và thông tin xét duyệt, theo danh sách trường cho phép (allowlist) |
| Admin | Giữ thông tin quản trị hiện có theo allowlist, gồm email và thông tin xét duyệt |

* Không trả `password`, `scheduleRevision` hay trường mới chưa được cho phép, kể cả cho admin.
* Query hồ sơ theo ID chỉ lấy bộ trường công khai nếu người xem không phải chính chủ/admin; DTO lọc lại response và giới hạn trường lồng trong `review`.
* Quy tắc áp dụng cả hồ sơ trực tiếp và hồ sơ lồng trong lớp học, yêu cầu tham gia, video, tài liệu, thông báo, bài tập, bài kiểm tra/bài nộp và cảnh báo học sinh.
* Giáo viên không nhận email của học sinh qua các response trên. Giao diện lớp học chỉ hiển thị email trong yêu cầu tham gia và danh sách học sinh cho admin.
* Chức năng thêm học sinh bằng email đã biết vẫn giữ nguyên; không bổ sung điều kiện cùng lớp khi xem hồ sơ công khai.
* Contract và quy tắc dữ liệu: [docs/USER_PRIVACY.md](docs/USER_PRIVACY.md). Cấu hình JWT/bootstrap admin được mô tả riêng trong tài liệu bảo mật.

---

### 2.7. Hiệu năng tải dữ liệu

* Danh sách lớp, user (admin), video, tài liệu, thông báo, bài tập và quiz luôn trả `{ data, page, limit, total, totalPages }`: mặc định 20, tối đa 100 bản ghi/trang. **Đây là thay đổi contract**, frontend/client cũ nhận mảng phải được cập nhật cùng backend.
* Danh sách lớp trả `studentCount`/`joinRequestCount` thay vì populate roster; danh sách quiz trả `questionCount`/`hasPromptImage`, không tải đề/ảnh base64. Endpoint chi tiết giữ chức năng hiện có.
* Dashboard phân trang; chi tiết lớp tải học liệu theo tab và lấy tổng qua `GET /api/classes/:id/content-summary`. Các route nặng được lazy-load.
* Kết nối MongoDB dùng chung promise trong mỗi instance, không tự tạo/khôi phục tài khoản admin. API riêng tư không cache ở CDN; có `Server-Timing` và logging timing tùy chọn.
* Kiểm duyệt phân trang theo tab; một số lịch sử/thông báo vẫn đọc nhiều trang. Thiết kế và [kết quả đo local](docs/PERFORMANCE.md#ket-qua) ở [docs/PERFORMANCE.md](docs/PERFORMANCE.md), không phải cam kết hiệu năng production.

---

### 2.8. Kháng cáo (`/appeals`, `/admin/moderation`)

* Học sinh gửi kháng cáo cảnh báo trong 7 ngày; giáo viên phụ trách gửi kháng cáo thông báo khóa lớp trong 24 giờ. Admin xét duyệt và lưu người xử lý/thời điểm/phản hồi.
* Quyết định và lịch sử chống ghi đè khi thao tác đồng thời. Xác nhận cảnh báo, gỡ khỏi lớp và cập nhật chế tài cùng transaction, cần MongoDB Atlas hoặc replica set.
* Học sinh chỉ xem cảnh báo của chính mình; hồ sơ kháng cáo khóa lớp dành cho giáo viên phụ trách/admin. Mở lớp giữ quyết định khóa ban đầu trong lịch sử.
* Contract, dữ liệu cũ và kiểm thử MongoDB thật: [docs/APPEALS.md](docs/APPEALS.md).

---

### 2.9. Quản lý tài khoản (`/admin/accounts`)

Admin mở **Quản lý tài khoản** (`/admin/accounts`) để tìm tên/email, lọc học sinh/giáo viên/quản trị và trạng thái, phân trang, duyệt/từ chối giáo viên chờ duyệt. Dùng API/phân quyền hiện có; không thêm đổi vai trò hoặc reset mật khẩu. Contract, cách kiểm thử và giới hạn: [docs/ADMIN_ACCOUNTS.md](docs/ADMIN_ACCOUNTS.md).

### 2.10. Buổi học và điểm danh (API)

Giáo viên phụ trách/admin tạo buổi học, cập nhật trạng thái và ghi điểm danh; học sinh chỉ xem điểm danh chính mình. Tạo lịch và các thao tác transaction yêu cầu MongoDB replica set/Atlas. Chưa có màn hình buổi học/điểm danh riêng; xem [docs/MONGODB_WORKFLOW.md](docs/MONGODB_WORKFLOW.md).

---

## 3. SƠ ĐỒ CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)

Các collection tài khoản và học liệu chính:

### Collection `users` (Học sinh, Giáo viên, Admin)
* `_id` (ObjectId, Khóa chính)
* `name` (String, bắt buộc)
* `email` (String, bắt buộc, unique)
* `password` (String, bắt buộc, hash bcrypt)
* `role` (String, enum `student`/`teacher`/`admin`, bắt buộc)
* `status` (`pending`/`active`/`inactive`/`left`/`rejected`), `isBlocked`, `review` (người/thời điểm/ghi chú xét duyệt)
* `avatar` (String, mặc định null) / `bio` (String) / `phone` (String)
* `enrolledClasses` ([ObjectId ref `Class`])
* `createdAt` / `updatedAt` (Date)

### Collection `classes` (Lớp học)
* `_id` / `name` (String, bắt buộc) / `description` (String)
* `teacher` (ObjectId ref `User`, bắt buộc)
* `students` ([ObjectId ref `User`])
* `subject` (String, bắt buộc) / `grade` (String) / `capacity` (Number, mặc định 50)
* `schedule` ({ `dayOfWeek`, `startTime`, `endTime` }) / `thumbnail` (String)
* `status` (enum `active`/`inactive`, mặc định `active`)

### Collection `quizzes` (Bài kiểm tra, nhúng `questions`)
* `_id` / `title` (bắt buộc) / `description`
* `class` (ref `Class`, bắt buộc) / `teacher` (ref `User`, bắt buộc)
* `questions[]`: { `type` (enum `multiple-choice`/`essay`/`short-answer`), `question`, `options[]`, `correctAnswer`, `points` }
* `totalPoints` / `timeLimit` (phút) / `dueDate` / `allowReview` / `shuffleQuestions`
* `status` (enum `draft`/`published`/`closed`)

### Collection `quizsubmissions` (Bài nộp)
* `quiz` (ref `Quiz`) / `student` (ref `User`) / `class` (ref `Class`)
* `answers[]` / `score` / `submittedAt`

### Collection `assignments` (Bài tập, nhúng `submissions`)
* `_id` / `title` (bắt buộc) / `description`
* `class` (ref `Class`) / `teacher` (ref `User`)
* `dueDate` (bắt buộc) / `totalPoints` (mặc định 100)
* `submissions[]`: { `student`, `fileUrl`, `submittedAt`, `isLate`, `score`, `feedback`, `gradedAt` }

### Collection `videos` (Video bài giảng)
* `_id` / `title` / `description` / `class` (ref) / `teacher` (ref)
* `videoUrl` / `duration` / `thumbnail` / `views`
* `viewedBy[]`: { `student`, `viewedAt`, `duration` }

### Collection `documents` (Tài liệu)
* `_id` / `title` / `description` / `class` (ref) / `teacher` (ref)
* `fileUrl` / `fileType` / `fileSize` / `downloads`

### Collection `announcements` (Thông báo)
* `_id` / `title` (bắt buộc) / `content` (bắt buộc)
* `class` (ref) / `teacher` (ref)
* `priority` (enum `low`/`normal`/`high`, mặc định `normal`)
* `readBy[]`: { `student`, `readAt` }

Ngoài ra có `ClassSession` (buổi học và điểm danh), `StudentWarning` (cảnh báo/kháng cáo/chế tài) và `AuditLog` (nhật ký thao tác). Quy tắc dữ liệu và transaction nằm trong [luồng dữ liệu](docs/MONGODB_WORKFLOW.md) và [kháng cáo](docs/APPEALS.md).

---

## 4. HƯỚNG DẪN CÀI ĐẶT CỤC BỘ (LOCAL SETUP)

### Bước 1: Chuẩn bị
1. Clone dự án về máy, cài Node.js v18+.
2. Chuẩn bị MongoDB Atlas hoặc MongoDB local. Các luồng tạo buổi học/xử lý chế tài cần **replica set**, không dùng MongoDB standalone thay transaction.
3. Tại thư mục `/backend`, tạo tệp `.env`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/tutoring-platform
   PORT=5000
   ```

`JWT_SECRET` phải được cấp riêng qua môi trường/secret manager: sinh ít nhất 32 byte ngẫu nhiên bằng CSPRNG, không dùng giá trị mẫu hoặc ghi khóa vào Git/log. Xem [chính sách JWT và xoay khóa](docs/BACKEND_SECURITY.md).

### Bước 2: Cài dependencies và tạo admin
```bash
npm install --prefix backend
npm install --prefix frontend
# Cấp MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD qua môi trường riêng/secret manager trước.
# Chỉ tạo admin mới; không chứa mật khẩu mặc định hoặc reset tài khoản hiện có.
npm run seed:admin --prefix backend
```

### Bước 3: Chạy 2 terminal song song
```bash
# Terminal 1 - Backend (http://localhost:5000)
npm run dev --prefix backend
# Terminal 2 - Frontend (http://localhost:3000, proxy /api -> :5000)
npm start --prefix frontend
```

Kiểm tra backend sống: mở `http://localhost:5000/api/health` phải ra `{"status":"ok"}`. Sau đó kiểm tra đăng nhập và API có xác thực; health check không chứng minh cấu hình JWT/database đã sẵn sàng cho mọi chức năng.

### Bước 4: Chạy kiểm thử và build

```bash
npm test --prefix backend
npm test --prefix frontend -- --watchAll=false --runInBand
npm run build --prefix frontend
```

Bộ test sử dụng `node:test`, gồm vòng đời tài khoản, lịch/điểm danh, tương thích luồng hiện có và bảo vệ dữ liệu hồ sơ (`backend/tests/userPrivacy.test.js`). Các test này dùng mock dữ liệu và HTTP local, không cần MongoDB thật.

Test quyền riêng tư kiểm tra chính chủ/admin/người khác, trường mới chưa được cho phép, hồ sơ lồng nhau, danh sách học sinh, yêu cầu vào lớp và bài nộp. Chạy test backend không thay thế việc build/kiểm thử frontend hoặc kiểm thử với database thật.

Kiểm thử MongoDB và browser dùng lab/dữ liệu giả riêng: [hướng dẫn công cụ](docs/PERFORMANCE_LAB.md), [quản lý tài khoản](docs/ADMIN_ACCOUNTS.md), [đổi mật khẩu](docs/USER_PRIVACY.md#doi-mat-khau). Không chạy test ghi dữ liệu lên production; kết quả và việc còn lại được theo dõi trong [PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

---

## 5. HƯỚNG DẪN DEPLOY VERCEL (FULLSTACK)

Frontend và backend deploy chung 1 domain: `vercel.json` build `frontend/build`, rewrite mọi `/api/*` về serverless function `api/index.js`.

### Các bước cài đặt:

1. Tạo cluster MongoDB Atlas (M0 free):
   * `Database Access` > tạo user + password, quyền Read/Write.
   * `Network Access`: cấp quyền kết nối phù hợp hạ tầng Vercel. Nếu phải dùng `0.0.0.0/0` do IP động, cần đánh giá rủi ro, dùng DB user quyền tối thiểu và quản lý credential an toàn; không mặc định coi mở toàn mạng là bắt buộc.
   * `Database` > Connect > Drivers (Node.js) > copy chuỗi `mongodb+srv://...`, thêm tên db: `...mongodb.net/tutoring-platform?...`.
2. Vercel Dashboard > project > Settings > Environment Variables, thêm cho cả Production:
   * `MONGODB_URI` = chuỗi Atlas ở trên (Type Secret).
   * `JWT_SECRET` = khóa sinh ngẫu nhiên theo [chính sách JWT](docs/BACKEND_SECURITY.md); thiếu/sai sẽ từ chối xác thực, không dùng khóa dự phòng.
3. Push code lên `main` (Vercel tự deploy) hoặc bấm Redeploy sau khi thêm env.
4. Kiểm tra `/api/health` trên domain đã triển khai, sau đó xác minh đăng nhập và các luồng chính bằng tài khoản kiểm thử được phép.

Sự cố thường gặp: chưa Redeploy sau khi đổi env, sai tên database/quyền kết nối Atlas, JWT secret thiếu/sai hoặc đăng ký lại email đã tồn tại.

---

## 6. TÀI LIỆU VÀ THEO DÕI

- [Chỉ mục tài liệu](docs/README.md): hướng dẫn theo từng chức năng.
- [Trạng thái dự án](docs/PROJECT_STATUS.md): issue, phát hành, kết quả kiểm tra và việc còn lại.
- [Quy tắc phát triển](project-rules.md): phạm vi thay đổi, bảo mật, kiểm thử và quy trình Git.
