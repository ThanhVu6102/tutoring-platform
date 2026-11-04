# Quy tắc làm việc với dự án EKLASSES

Áp dụng khi tiếp tục phát triển **EKLASSES / tutoring-platform**, nền tảng quản lý lớp học trực tuyến với ba vai trò `admin`, `teacher`, `student`.

## 1. Đọc và xác minh trước khi thay đổi

1. Đọc toàn bộ `README.md` và file quy tắc này.
2. Đọc tài liệu liên quan đến nhiệm vụ nếu có:
   - `docs/local/PROJECT_SCOPE.md`: phạm vi và ngoài phạm vi; tài liệu local, không mặc định có trên mọi máy.
   - `docs/MONGODB_WORKFLOW.md`: vòng đời tài khoản, buổi học, điểm danh và yêu cầu transaction.
   - `docs/USER_PRIVACY.md`: quy tắc bảo vệ hồ sơ của BE #01.
   - `AGENTS.md`, `RULES.md` và tài liệu trong `docs/` nếu được bổ sung sau này.
3. Kiểm tra cấu trúc repository, code liên quan, `package.json` và cấu hình triển khai.
4. Kiểm tra `git status`, branch hiện tại, upstream và lịch sử commit gần nhất. Nhận diện thay đổi của người dùng trước khi sửa.
5. Nếu nhiệm vụ nhắc đến GitHub issue, đọc đúng số issue và tiêu đề. Nhãn như **BE #01** không nhất thiết là GitHub issue `#1`; xác minh thay vì suy đoán.
6. Không giả định còn nhớ cuộc trò chuyện trước, tài liệu chưa tồn tại hoặc tính năng đã hoàn thành chỉ vì có tên trong README.
7. Khi tài liệu và code mâu thuẫn, ghi rõ khác biệt, dẫn đường dẫn liên quan và xin xác nhận trước khi thay đổi quyết định nghiệp vụ.

Không bắt buộc đọc file không tồn tại và không tự tạo tài liệu còn thiếu ngoài nhiệm vụ. Không dùng `docs/local/README_Example.md` làm đặc tả EKLASSES nếu chưa được xác nhận. Các đường dẫn trong file quy tắc này tính từ thư mục gốc dự án.

Sau khi tìm hiểu, tóm tắt ngắn: trạng thái liên quan đến nhiệm vụ, phần đã có, phần còn thiếu/mâu thuẫn và bước tiếp theo. Nếu chỉ được yêu cầu đọc hoặc kiểm tra, chưa sửa code. Nếu đã được giao nhiệm vụ chỉnh sửa cụ thể, làm trong phạm vi đã xác nhận, không tự mở rộng.

## 2. Kế hoạch, phạm vi và xin ý kiến

- Trước khi sửa frontend, trình bày phạm vi, màn hình, luồng thao tác, API liên quan, file dự kiến thay đổi và cách kiểm tra; chỉ triển khai sau khi được xác nhận kế hoạch.
- Với backend hoặc thay đổi xuyên suốt hệ thống, nêu phương án và xin xác nhận các quyết định ảnh hưởng quyền hạn, dữ liệu, API contract hoặc hành vi nghiệp vụ.
- Trong khi sửa, nếu phát sinh lựa chọn cần ý kiến, hỏi ngay tại bước đó rồi chờ trả lời; không tự quyết hoặc chỉ báo lại sau khi đã sửa.
- Không tự thêm chức năng, trạng thái, quyền hạn, dependency, dịch vụ ngoài hoặc dữ liệu mẫu chưa được duyệt.
- Mock data phục vụ demo/giao diện phải được cho phép và ghi rõ. Mock trong test phải tách khỏi dữ liệu ứng dụng thật.
- Ghi chú **chức năng của đoạn code đã sửa bằng tiếng Việt**, tập trung vào mục đích, quy tắc và lý do; không chỉ diễn giải lại cú pháp.
- Cập nhật tài liệu và test liên quan trong phạm vi nhiệm vụ. Không sửa các phần không liên quan chỉ để làm sạch code.

## 3. Kiến trúc và luồng dữ liệu

- Giữ nền tảng hiện tại: React ở `frontend/`, Node.js + Express ở `backend/`, MongoDB + Mongoose và Vercel qua `api/index.js`.
- Khi kiểm tra luồng, lần theo: màn hình/component → cấu hình gọi API → route/middleware → helper/model → database → lọc response → giao diện.
- Đọc `frontend/src/config/api.js`, `backend/server.js`, router, middleware và model liên quan trước khi thay đổi contract.
- Không tự đổi method, URL, tên trường, dạng response, mã trạng thái hoặc quy tắc xác thực. Nếu cần đổi, trình bày ảnh hưởng frontend/backend và xin xác nhận.
- Không tự sửa backend/database chỉ để khớp một thiết kế frontend mới.
- Thay đổi schema hoặc thao tác dữ liệu thật phải nêu ảnh hưởng dữ liệu cũ, nhu cầu migration và xin phép trước khi chạy.
- Không bỏ kiểm tra quyền, validation, transaction hoặc lịch sử/audit để làm test qua hay tránh lỗi môi trường.
- API tạo buổi học yêu cầu MongoDB replica set/Atlas theo tài liệu; không tự thêm fallback ghi không có transaction.
- Không coi `/api/docs` dạng JSON rút gọn là tài liệu OpenAPI/Swagger đầy đủ hoặc luôn khớp toàn bộ code.

## 4. Bảo mật và quyền riêng tư

- Backend phải kiểm tra vai trò, quyền sở hữu, quan hệ lớp và trạng thái tài khoản/tài nguyên theo nghiệp vụ. Ẩn nút hoặc chặn route frontend chỉ hỗ trợ UX.
- Giữ các quyết định BE #01 trong `docs/USER_PRIVACY.md`: người khác chỉ nhận hồ sơ công khai tối thiểu; chính chủ/admin nhận dữ liệu theo allowlist; không trả password/hash hoặc `scheduleRevision`.
- Kiểm tra cả dữ liệu user lồng nhau và các trường được `populate`, không chỉ endpoint hồ sơ trực tiếp.
- Không tự thay đổi cách lưu/truyền token, cơ chế admin, khóa JWT hoặc quyền xem dữ liệu nếu chưa được duyệt.
- Không đưa secret vào source, client bundle, URL, log hoặc tài liệu. Biến môi trường được nhúng vào frontend không phải nơi lưu secret.
- Không in lại mật khẩu, JWT hoặc URI database thật trong báo cáo; che giá trị khi cần minh họa.
- Không coi `.gitignore` là cách xóa secret đã commit; nếu phát hiện lộ thông tin, báo để chốt phương án thu hồi/thay khóa và xử lý lịch sử.
- Khi phát hiện lỗ hổng ngoài phạm vi, báo rõ mức độ và đề xuất issue riêng; không âm thầm sửa rộng hoặc kết luận hệ thống đã an toàn toàn diện.

## 5. Thiết kế và triển khai frontend

### Nhất quán giao diện

- Bám mockup, ảnh tham chiếu và design system đã được duyệt; đọc `docs/design-system.md` nếu có.
- Thống nhất màu sắc, font, spacing, icon, button, form, card, bảng và modal; ưu tiên component/style có sẵn.
- Dùng tiếng Việt nhất quán, nhãn dễ hiểu, phù hợp nghiệp vụ lớp học EKLASSES.
- Chưa có quy chuẩn thiết kế thì đề xuất và xin duyệt trước khi áp dụng rộng rãi.

### Luồng thao tác và trạng thái

- Mỗi màn hình có mục tiêu, hành động chính và điều hướng rõ ràng.
- Chỉ cho thao tác phù hợp vai trò, quyền sở hữu và trạng thái nghiệp vụ. Không để nút/liên kết giả trong phần được giao hoàn thiện.
- Có xác nhận phù hợp cho thao tác quan trọng, phản hồi kết quả và chặn gửi lặp khi đang xử lý.
- Form có label, dấu hiệu bắt buộc, hướng dẫn và lỗi cụ thể. Validation/giới hạn upload phải khớp backend.
- Xử lý loading, empty, error, success; phân biệt chưa có dữ liệu với tìm kiếm không có kết quả.
- Giữ nội dung form khi request thất bại nếu phù hợp; xử lý hết phiên, không đủ quyền và tài nguyên không tồn tại.
- Không hiển thị stack trace hoặc lỗi kỹ thuật nội bộ cho người dùng.

### Responsive và accessibility

- Dùng được trên mobile, tablet và desktop; không để nội dung dài gây vỡ layout hoặc tràn ngang ngoài chủ đích.
- Bảo đảm chữ dễ đọc, độ tương phản và vùng bấm phù hợp.
- Hỗ trợ bàn phím, focus rõ ràng, label cho input và tên truy cập cho nút chỉ có icon.
- Không chỉ dùng màu sắc để biểu đạt trạng thái.

## 6. Git, review và triển khai

- Ưu tiên branch chức năng/sửa lỗi đã có và đúng nhiệm vụ. Hỏi branch đích khi chưa rõ; chỉ tạo branch mới khi cần và được xác nhận.
- Không push trực tiếp lên `main`, `develop` hoặc `dev`. Chỉ commit/push khi được yêu cầu; staging đúng file thuộc nhiệm vụ, không dùng `git add .` một cách mù quáng.
- Không xóa, reset, ghi đè hoặc revert thay đổi của người dùng; không force-push, rewrite history hoặc thực hiện thao tác phá hủy khi chưa được phép rõ ràng.
- Trước khi chuyển branch/merge, kiểm tra khác biệt nền code. Xin xác nhận nếu phải kéo thêm thay đổi ngoài issue; nếu có xung đột ảnh hưởng hành vi, hỏi trước khi chọn phiên bản.
- Luồng review đề xuất: branch chức năng → PR vào `develop` → kiểm thử tích hợp/staging → PR vào `main` khi đủ điều kiện phát hành. Không tự tạo/merge PR, đóng issue hoặc deploy chỉ vì đã được phép push.
- Vercel Preview dùng kiểm tra PR trước merge; staging từ `develop` dùng kiểm thử tích hợp; production từ `main`. Không khẳng định các môi trường đã tồn tại nếu chưa xác minh.
- Preview/staging dùng database và cấu hình thử nghiệm riêng; không tự chạy seed, migration hoặc test ghi dữ liệu lên production.
- Giữ tài liệu trong `docs/local/`, gồm `PROJECT_SCOPE.md` và `README_Example.md`, ở local theo `.gitignore`; không force-add tài liệu bị ignore khi chưa được yêu cầu.
- Không tự tạo lại `graphify-out/`, cài graph tool hoặc Git hook; thư mục này đã được yêu cầu loại bỏ. Chỉ khôi phục nếu có yêu cầu mới.

## 7. Kiểm tra và bàn giao

Chạy lệnh phù hợp với phần thay đổi, dựa trên script/dependency thực tế:

```bash
# Test backend: tài khoản, lịch/điểm danh, tương thích và quyền riêng tư
npm test --prefix backend

# Test frontend không chạy watch
npm test --prefix frontend -- --watchAll=false

# Build frontend
npm run build --prefix frontend

# Kiểm tra lỗi whitespace trong thay đổi đã được Git theo dõi
git diff --check
```

- Không mặc định repo có script lint/typecheck; kiểm tra `package.json` trước. `git diff --check` không kiểm tra nội dung file chưa được Git theo dõi.
- Nếu thiếu dependency hoặc không chạy được kiểm tra, báo rõ nguyên nhân; không báo test/build đạt khi chưa chạy. Không tự cài thêm dependency chưa được duyệt.
- Thay đổi bảo mật/phân quyền cần test cả cho phép và từ chối truy cập, chính chủ/người khác/admin, response lồng nhau và các trường không được phép.
- Kiểm tra luồng chính, trạng thái lỗi và responsive nếu sửa giao diện. Test dùng mock không thay thế kiểm thử với MongoDB thật, transaction/concurrency hoặc môi trường triển khai.
- Kết quả của phiên trước chỉ là tham khảo; không dùng số test hoặc commit cũ làm bằng chứng cho code mới.
- Báo cáo cuối gồm: kết quả, file chính đã đổi, kiểm tra đã chạy, phần chưa xác minh và trạng thái commit/push/PR nếu có.
- Chỉ kết luận trong phạm vi đã kiểm tra. Nếu còn nút chưa hoạt động hoặc mock chưa được thay thế trong phạm vi đã duyệt, báo rõ phần chưa hoàn thành.
