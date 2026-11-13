# Kiểm tra giao diện FE04 và FE11

Phạm vi: giao diện sáng cố định và responsive trên các trang công khai, dashboard, chi tiết lớp và biểu mẫu. Trạng thái phát hành và kết quả kiểm tra các chức năng khác ở [PROJECT_STATUS.md](PROJECT_STATUS.md).

Kiểm tra trên production build tại loopback với backend và MongoDB replica set QA riêng, tài khoản `example.test`/QA. Không dùng dữ liệu production.

## Kết quả

| Phạm vi | Kiểm tra | Kết quả |
|---|---|---|
| Trang công khai và ba vai trò | Chrome ở 320, 375, 390, 414, 430, 768, 1024, 1280px; 158 lượt mở trang/menu | Không tràn ngang, không lỗi JavaScript/console trong các lượt kiểm tra |
| FE04 | Chrome light/dark trên login, register, dashboard ba vai trò; Edge light/dark trên login 320px | `color-scheme: light`, nền input trắng; ảnh login Chrome light và dark trùng hash SHA-256 |
| FE11 | 60 lượt kiểm tra form tạo lớp, bộ lọc admin, chi tiết lớp, modal khóa, tải lại bộ lọc ở 320, 375, 390, 430, 768, 1280px | Không tràn ngang; bộ lọc giữ sau tải lại |
| FE11 dữ liệu dài | 20 lượt với tên/email/môn học/khối là chuỗi dài không dấu cách, gồm viewport thấp 400px khi focus input | Trang admin 390px: trước 1241px, sau 390px; không tràn ngang ở các độ rộng kiểm tra |
| FE11 chi tiết lớp | 12 lượt với tên/mô tả lớp và tên học sinh là chuỗi dài, ba vai trò ở 320, 390, 768, 1280px | Không tràn ngang sau khi sửa tiêu đề và danh sách học sinh admin |
| FE11 trạng thái form | Giáo viên tạo lớp ở 320px, API lỗi 503 rồi thành công giả lập | Có thông báo lỗi, giữ dữ liệu để thử lại; thành công có thông báo trạng thái |
| FE/BE #01 | 10 test integration trên MongoDB replica set, gồm quyền, tổ hợp lọc, sort, tổng, phân trang và dữ liệu rỗng | Đạt; contract ở [Hiệu năng](PERFORMANCE.md) |
| Test và build | `npm test --prefix frontend`, `npm test --prefix backend`, `npm run build --prefix frontend` | 51 test frontend, 135 test backend đạt; build thành công |

Ảnh [trước khi sửa dữ liệu dài](qa/fe11-before-long-admin-390.png) dùng CSS từ `develop` tại commit `1192633` với cùng JavaScript và dữ liệu QA; ảnh [sau khi sửa](qa/fe11-after-long-admin-390.png) dùng CSS mới. Ảnh [login khi hệ điều hành ở dark mode](qa/fe04-dark-login-390.png) cho thấy giao diện vẫn sáng.

## Giới hạn

Đây là kiểm tra Chrome/Edge headless và mô phỏng viewport/touch/bàn phím ảo bằng cách giảm chiều cao viewport. Chưa kiểm tra trên điện thoại vật lý hoặc môi trường Preview/production. Dữ liệu dài và phản hồi tạo lớp được thay trong response API tại trình duyệt để kiểm tra layout/trạng thái, không ghi vào database.
