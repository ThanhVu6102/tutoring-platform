# Tối ưu ảnh frontend

Ảnh nền đăng nhập/đăng ký dùng `frontend/src/assets/background.webp` qua CSS,
để build sinh tên file có hash. Logo và watermark dùng WebP trong
`frontend/public/`; không đổi bố cục, kích thước ảnh hoặc URL avatar người dùng.
Logo dùng nén lossless; ảnh nền dùng quality 85, giữ nguyên 2048 × 1152 và alpha.
Không lazy-load logo đang hiển thị trên màn hình đầu.

PNG gốc được giữ để chỉnh sửa/tạo lại ảnh và tương thích URL cũ. Chúng không còn
được tham chiếu bởi các thành phần đã tối ưu; file trong `public/` vẫn được copy
khi build nhưng trình duyệt không tự tải nếu không có tham chiếu.

## Tạo lại ảnh

Máy xử lý cần Python với Pillow hỗ trợ WebP (không phải dependency chạy web).
Không cần chạy bước này trên Vercel; commit các WebP cùng thay đổi code.

```powershell
py frontend/scripts/optimize-images.py
```

Script kiểm tra kích thước, alpha và pixel hiển thị của logo lossless.

## Dung lượng file trước/sau

| Ảnh | PNG (byte) | WebP (byte) |
| --- | ---: | ---: |
| background | 2.470.855 | 131.054 |
| centerlogo | 174.470 | 85.680 |
| GiaoVienLogo | 49.013 | 38.620 |
| HocSinhLogo | 48.345 | 37.318 |
| icon1 | 66.037 | 35.728 |
| icon2 | 72.028 | 36.530 |
| logo1 | 65.657 | 50.600 |

Đây là dung lượng file local, không phải kết quả đo thời gian tải production.
Sau triển khai, kiểm tra Network với Disable cache và mạng chậm: các URL WebP
phải trả ảnh thành công; kiểm tra đăng nhập, đăng ký, navbar và hồ sơ ở desktop/mobile.
So sánh hình ảnh và thời gian tải trước/sau trong cùng điều kiện.
