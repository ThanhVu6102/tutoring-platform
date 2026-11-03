import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { POLICY_VERSION } from '../config/policyLabels';

const PolicySection = ({ title, items }) => (
  <section className="policy-section">
    <h2>{title}</h2>
    <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
  </section>
);

const PoliciesPage = ({ embedded = false, onRead }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const returnToRegister = location.state?.returnToRegister;

  const markAsRead = () => {
    sessionStorage.setItem('policy-read-version', POLICY_VERSION);
    if (onRead) {
      onRead();
      return;
    }
    if (returnToRegister) navigate('/register');
  };

  const pageContent = (
    <main className="policy-page">
      <header className="policy-header">
        <p className="policy-eyebrow">EKLASSES · PHIÊN BẢN {POLICY_VERSION}</p>
        <h1>Chính sách &amp; Quy định ứng xử</h1>
        <p>Quy định áp dụng cho học sinh, phụ huynh, giáo viên và hoạt động trên nền tảng.</p>
      </header>

      <div className="policy-content">
        <PolicySection title="Học sinh và phụ huynh" items={[
          'Sử dụng thông tin định danh chính xác, gồm họ tên và email hoặc số điện thoại chính chủ.',
          'Không gửi nội dung đồi trụy, thô tục, đe dọa hoặc xúc phạm giáo viên và học sinh khác.',
          'Không spam, quảng cáo thương mại hoặc phát tán liên kết độc hại trong thảo luận và bài tập.',
          'Không ghi âm, ghi hình bài giảng hoặc phát tán giáo trình, bài tập và đề thi độc quyền khi chưa được đồng ý.',
          'Không chia sẻ tài khoản cá nhân; tuân thủ thỏa thuận học phí với giáo viên.',
          'Không gian lận điểm số, mạo danh hoặc cố ý làm gián đoạn hệ thống trực tuyến.',
        ]} />

        <PolicySection title="Giáo viên tự do" items={[
          'Chịu trách nhiệm về tính chính xác, văn hóa và pháp lý của bài giảng, tài liệu tải lên.',
          'Không đăng nội dung trái pháp luật, kích động bạo lực hoặc trái thuần phong mỹ tục.',
          'Duy trì chuẩn mực sư phạm; không xúc phạm hoặc miệt thị học sinh.',
          'Bảo mật số điện thoại, địa chỉ và kết quả học tập; không mua bán hoặc chia sẻ dữ liệu học sinh cho bên thứ ba.',
          'Công khai học phí, lộ trình và chính sách hoàn tiền (nếu có) trước khi nhận học sinh.',
        ]} />

        <section className="policy-section">
          <h2>Quy trình xử lý vi phạm</h2>
          <p className="policy-process">Báo cáo vi phạm <span>→</span> Xác minh dữ liệu <span>→</span> Áp dụng mức xử lý</p>
          <div className="policy-level-grid">
            <article>
              <h3>Mức 1 · Nhẹ</h3>
              <p>Spam, đi học muộn/bỏ học không lý do nhiều lần hoặc vô ý gây gián đoạn buổi học.</p>
              <p>Cảnh cáo qua thông báo, SMS/email khi được cấu hình; có thể giới hạn đăng bài từ 24 giờ đến 3 ngày.</p>
            </article>
            <article>
              <h3>Mức 2 · Trung bình</h3>
              <p>Ngôn từ xúc phạm, chia sẻ tài khoản hoặc tái phạm lỗi mức 1 sau cảnh cáo.</p>
              <p>Có thể tạm dừng lớp từ 3 đến 14 ngày và gửi thông báo chính thức tới các bên liên quan.</p>
            </article>
            <article>
              <h3>Mức 3 · Nghiêm trọng</h3>
              <p>Phát tán nội dung trái pháp luật, xâm phạm bản quyền, gian lận hệ thống hoặc lừa đảo.</p>
              <p>Có thể chấm dứt lớp, khóa tài khoản và chuyển bằng chứng tới cơ quan có thẩm quyền khi cần.</p>
            </article>
          </div>
        </section>

        <PolicySection title="Thông báo khóa lớp và kháng cáo" items={[
          'Khi Admin đề nghị khóa lớp, giáo viên nhận thông báo trong hệ thống kèm lý do, mức vi phạm và mô tả cụ thể.',
          'Lớp chưa bị khóa ngay. Giáo viên có 24 giờ kể từ lúc gửi thông báo để gửi kháng cáo trong trang lớp.',
          'Nếu không có kháng cáo trong 24 giờ, Admin có thể chính thức khóa lớp. Nếu có kháng cáo, Admin xem xét và quyết định khóa hoặc hủy thông báo.',
          'Sau khi lớp đã khóa, giáo viên liên hệ Admin qua email admin@eklasses.vn để yêu cầu xem xét mở lại.',
          'Lớp đã khóa sẽ chặn truy cập nội dung cho đến khi Admin mở lại. Hành động khóa/mở và nội dung kháng cáo được lưu trong hệ thống.',
        ]} />

        <PolicySection title="Cảnh báo học sinh và xử lý tái phạm" items={[
          'Mỗi cảnh báo phải nêu rõ lớp, mức độ, quy định vi phạm, mô tả và bằng chứng liên quan; cảnh báo đang chờ xử lý chưa được tính.',
          'Học sinh có 7 ngày kể từ khi nhận cảnh báo để gửi kháng cáo và trình bày rõ thông tin/bằng chứng. Nếu Admin chấp thuận, cảnh báo được gỡ và không tính; nếu từ chối hoặc hết hạn không kháng cáo, cảnh báo được xác nhận và tính vào lớp đó.',
          'Khi có đủ 3 cảnh báo đã xác nhận trong cùng một lớp, học sinh bị gỡ khỏi lớp và sự việc được ghi nhận.',
          'Nếu tiếp tục tái phạm và bị gỡ khỏi một lớp khác sau khi đã có lần gỡ đầu tiên, tài khoản bị đình chỉ 7 ngày; lần tái phạm kế tiếp đình chỉ 1 tháng; lần cuối khóa tài khoản vĩnh viễn.',
          'Tài khoản đang đình chỉ không thể đăng nhập hoặc sử dụng API. Sau khi hết thời hạn, quyền truy cập được khôi phục; số lần vi phạm đã ghi nhận vẫn được lưu.',
        ]} />

        <PolicySection title="Vận hành và khiếu nại" items={[
          'Giáo viên có thể quản lý việc tham gia của học sinh trong phạm vi lớp mình phụ trách.',
          'Admin có thể gửi thông báo tạm dừng lớp khi có báo cáo vi phạm; việc khóa chính thức phải qua thời hạn phản hồi nêu trên.',
          'Các hình thức xử lý tài khoản, lớp học và dữ liệu được xem xét theo mức độ, bằng chứng và quy định pháp luật hiện hành.',
          'Với khiếu nại sau khi khóa lớp, liên hệ admin@eklasses.vn trong vòng 7 ngày làm việc để được xem xét.',
        ]} />
      </div>

      <footer className="policy-footer">
        <p>Chính sách có hiệu lực từ ngày 19/10/2026. Khi có cập nhật quan trọng, người dùng sẽ được yêu cầu xác nhận lại.</p>
        <button className="btn btn-primary" onClick={markAsRead} type="button">
          {embedded || returnToRegister ? 'Tôi đã đọc, quay lại đăng ký' : 'Tôi đã đọc chính sách'}
        </button>
      </footer>
    </main>
  );

  if (!embedded) return pageContent;

  return (
    <div className="policy-modal-backdrop policy-reader-backdrop" role="presentation">
      <div aria-label="Chính sách và quy định ứng xử" aria-modal="true" className="policy-reader-modal" role="dialog">
        {pageContent}
      </div>
    </div>
  );
};

export default PoliciesPage;