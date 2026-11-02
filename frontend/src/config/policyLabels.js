export const POLICY_VERSION = '0.1.1';

export const policyReasonLabels = {
  spam: 'Spam, quảng cáo hoặc liên kết độc hại',
  abusive_content: 'Ngôn từ xúc phạm hoặc nội dung không phù hợp',
  copyright: 'Vi phạm bản quyền',
  account_sharing: 'Chia sẻ tài khoản',
  academic_fraud: 'Gian lận học tập hoặc hệ thống',
  illegal_content: 'Nội dung trái pháp luật',
  privacy_breach: 'Vi phạm quyền riêng tư',
  financial_misconduct: 'Vi phạm minh bạch tài chính',
  class_disruption: 'Gây gián đoạn lớp học',
  other: 'Vi phạm chính sách khác',
};

export const lockStatusLabels = {
  pending: 'Chờ phản hồi 24 giờ',
  appealed: 'Đã nhận kháng cáo',
  locked: 'Đã khóa chính thức',
  dismissed: 'Đã hủy thông báo',
};