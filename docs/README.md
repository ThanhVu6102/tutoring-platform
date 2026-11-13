# Tài liệu EKLASSES

| Tài liệu | Nội dung |
|---|---|
| [Luồng dữ liệu](MONGODB_WORKFLOW.md) | Tài khoản, buổi học, điểm danh và transaction |
| [Hồ sơ và mật khẩu](USER_PRIVACY.md) | Quyền riêng tư, trường được phép trả và [đổi mật khẩu](USER_PRIVACY.md#doi-mat-khau) |
| [Khởi tạo quản trị viên](ADMIN_BOOTSTRAP.md) | Tạo tài khoản ban đầu thủ công, không ghi đè mật khẩu hoặc khôi phục tài khoản hiện có |
| [Bảo mật backend](BACKEND_SECURITY.md) | JWT fail closed, giới hạn kiểm thử và checklist xoay khóa vận hành |
| [Kháng cáo và kiểm duyệt](APPEALS.md) | Cảnh báo/chế tài, khóa lớp, lịch sử và [API kiểm duyệt](APPEALS.md#kiem-duyet) |
| [Hiệu năng](PERFORMANCE.md) | Phân trang, truy vấn, tải frontend, số đo và [nghiệm thu BE #04](PERFORMANCE.md#ket-qua) |
| [Kiểm tra giao diện](FRONTEND_QA.md) | Bằng chứng FE04/FE11 trên bản build và giới hạn kiểm tra |
| [Công cụ kiểm chứng](PERFORMANCE_LAB.md) | Chạy benchmark, MongoDB integration và Chromium an toàn |

## Quy ước

- [README gốc](../README.md) hướng dẫn cài đặt/chạy nhanh; [quy tắc dự án](../project-rules.md) mô tả quy trình phát triển. Tài liệu chức năng giữ contract/nghiệp vụ; tài liệu hiệu năng giữ số đo, hướng dẫn lab giữ lệnh chạy, tránh lặp.
- Nội dung tiếng Việt; giữ định danh mã nguồn, URL, khóa JSON và giá trị kỹ thuật để khớp hệ thống. Số test gắn với source/thời điểm đã chạy, không tự đại diện cho bản mới.
- `local/` giữ tài liệu nội bộ, mẫu tham khảo và report thô, được ignore và không có sẵn khi clone; không dọn/xóa dữ liệu trong đó. Mẫu README không phải đặc tả dự án.
- Không đưa mật khẩu/token/URI thật vào tài liệu chia sẻ. `/api/docs` chỉ liệt kê endpoint rút gọn, không phải OpenAPI đầy đủ. Done của một issue không xác nhận mọi kiểm tra production đều đạt.

Đã hợp nhất: `CHANGE_PASSWORD.md` → `USER_PRIVACY.md`; `MODERATION_PAGINATION_PLAN.md` → `APPEALS.md`; `PERFORMANCE_ACCEPTANCE.md` → `PERFORMANCE.md`. Bản cũ vẫn tra được trong lịch sử Git.
