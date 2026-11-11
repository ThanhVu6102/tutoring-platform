# Tài liệu dự án

Thư mục `docs/` tập trung tài liệu kỹ thuật của EKLASSES.

## Tài liệu hiện có

| Tài liệu | Nội dung |
|----------|----------|
| [MongoDB workflow](MONGODB_WORKFLOW.md) | Vòng đời tài khoản, buổi học, điểm danh và yêu cầu transaction |
| [Quyền riêng tư hồ sơ](USER_PRIVACY.md) | Quy tắc lọc dữ liệu và phân quyền hồ sơ trong API |
| [Đổi mật khẩu](CHANGE_PASSWORD.md) | API và form chính chủ, giới hạn tài khoản quản trị/phiên JWT |
| [Kháng cáo — BE #03](APPEALS.md) | API cảnh báo học sinh/khóa lớp, chuyển trạng thái, chế tài và kiểm thử transaction |
| [Hiệu năng](PERFORMANCE.md) | Phân trang, tối ưu tải dữ liệu, công cụ đo và giới hạn kiểm thử |
| [Lab hiệu năng — BE #04 giai đoạn 2](PERFORMANCE_LAB.md) | Docker local cách ly, dữ liệu giả, baseline/query plan thực tế và giới hạn của phép đo |
| [Bằng chứng nghiệm thu BE #04](PERFORMANCE_ACCEPTANCE.md) | Snapshot before/after, MongoDB integration, Chromium smoke và ngoại lệ cần chốt |
| [Phân trang kiểm duyệt](MODERATION_PAGINATION_PLAN.md) | Contract admin riêng, thống kê chính xác và phạm vi FE đã được xác nhận |

## Cách tổ chức

- [README chính](../README.md) ở thư mục gốc: giới thiệu dự án và hướng dẫn chạy nhanh.
- [Quy tắc làm việc](../project-rules.md) ở thư mục gốc: hướng dẫn phát triển dự án.
- `local/`: tài liệu nội bộ và mẫu tham khảo, được `.gitignore` loại trừ; không có sẵn khi clone repository.
- Tài liệu API, kiến trúc, cơ sở dữ liệu và triển khai mới sẽ được bổ sung vào `docs/` khi cần.

Không đưa mật khẩu, token hoặc thông tin kết nối thật vào tài liệu được chia sẻ. Mẫu README trong `local/` chỉ để tham khảo cách trình bày, không phải đặc tả EKLASSES.
