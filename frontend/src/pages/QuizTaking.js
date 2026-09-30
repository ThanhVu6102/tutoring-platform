// ============================================================================
// FILE: frontend/src/pages/QuizTaking.js
// MỤC ĐÍCH: Trang làm bài kiểm tra (/quiz/:quizId/take) có chống gian lận.
// - Tải đề theo quizId, hiển thị 3 dạng câu hỏi (trắc nghiệm / tự luận / ngắn).
// - Đếm ngược timeLimit, hết giờ tự nộp bài.
// - Phát hiện chuyển tab (visibilitychange) thì hiện màn hình cảnh báo.
// - Nộp bài qua POST /api/quizzes/:quizId/submit.
// ============================================================================

// Nạp React + hook: useState (đề, đáp án, giờ, trạng thái) + useEffect (tải đề, timer).
import React, { useState, useEffect } from 'react';
// Nạp useParams (lấy quizId trên URL) + useNavigate (quay lại sau khi nộp).
import { useParams, useNavigate } from 'react-router-dom';
// Nạp axios gọi API.
import axios from 'axios';

// Component trang làm bài.
const QuizTaking = () => {
  // Lấy quizId từ URL /quiz/:quizId/take.
  const { quizId } = useParams();
  // Hàm quay lại trang trước.
  const navigate = useNavigate();
  // State quiz: object đề thi tải từ backend (null = đang tải).
  const [quiz, setQuiz] = useState(null);
  // State answers: object { [indexCâu]: {answer: giá trị} }.
  const [answers, setAnswers] = useState({});
  // State timeLeft: số giây còn lại (null = chưa tính / đề không giới hạn).
  const [timeLeft, setTimeLeft] = useState(null);
  // State submitted: true khi đã nộp (để dừng timer + dừng cảnh báo tab).
  const [submitted, setSubmitted] = useState(false);
  // State tabSwitched: true khi phát hiện rời tab -> hiện màn hình cảnh báo.
  const [tabSwitched, setTabSwitched] = useState(false);
  // Lấy token để gắn Authorization cho mọi API quiz.
  const token = localStorage.getItem('token');

  // useEffect 1: tải đề + gắn nghe sự kiện chuyển tab.
  // - Chạy lại khi quizId đổi hoặc submitted đổi.
  useEffect(() => {
    fetchQuiz(); // tải đề thi.

    // HÀM: handleVisibilityChange - phát hiện chuyển tab / thu nhỏ cửa sổ.
    // - document.hidden = true nghĩa là tab không còn hiển thị.
    // - Nếu chưa nộp mà ẩn tab thì bật cờ cảnh báo gian lận.
    const handleVisibilityChange = () => {
      if (document.hidden && !submitted) {
        setTabSwitched(true);
      }
    };

    // Đăng ký nghe sự kiện đổi hiển thị tab.
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Dọn dẹp khi unmount để tránh rò rỉ listener.
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [quizId, submitted]);

  // useEffect 2: khi có đề + chưa nộp thì tính giờ còn lại từ timeLimit (phút -> giây).
  useEffect(() => {
    if (quiz?.timeLimit && !submitted) {
      setTimeLeft(quiz.timeLimit * 60);
    }
  }, [quiz, submitted]);

  // useEffect 3: vòng lặp đếm ngược mỗi giây.
  // - Nếu chưa có giờ hoặc đã nộp thì không chạy.
  // - Mỗi giây trừ 1; về <=1 thì tự gọi handleSubmit() và dừng ở 0.
  useEffect(() => {
    if (timeLeft === null || submitted) return; // chưa cần đếm.

    // Tạo interval 1 giây.
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        // Hết giờ -> tự nộp bài.
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        // Còn giờ -> trừ 1 giây.
        return prev - 1;
      });
    }, 1000);

    // Dọn interval khi timeLeft/submitted đổi hoặc unmount.
    return () => clearInterval(timer);
  }, [timeLeft, submitted]);

  // HÀM: fetchQuiz - tải chi tiết đề từ GET /api/quizzes/:quizId.
  const fetchQuiz = async () => {
    try {
      const response = await axios.get(`/api/quizzes/${quizId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuiz(response.data); // lưu đề vào state để vẽ câu hỏi.
    } catch (error) {
      console.error('Error fetching quiz:', error);
    }
  };

  // HÀM: handleAnswerChange(questionIndex, value) - lưu đáp án 1 câu.
  // - Giữ nguyên các câu khác (...answers), chỉ cập nhật câu vừa sửa.
  const handleAnswerChange = (questionIndex, value) => {
    setAnswers({
      ...answers,
      [questionIndex]: { answer: value }
    });
  };

  // HÀM: handleSubmit - nộp bài lên backend.
  // LUỒNG:
  //  - B1: Chuyển object answers thành mảng [{questionId: index, answer}].
  //  - B2: POST /api/quizzes/:quizId/submit kèm answers + classId.
  //  - B3: Đánh dấu submitted, báo thành công, quay lại trang trước.
  const handleSubmit = async () => {
    try {
      // B1: Biến đổi định dạng cho backend dễ chấm.
      const submissionAnswers = Object.entries(answers).map(([index, data]) => ({
        questionId: index,
        answer: data.answer
      }));

      // B2: Gửi bài (quiz.class để backend biết thuộc lớp nào).
      await axios.post(`/api/quizzes/${quizId}/submit`,
        { answers: submissionAnswers, classId: quiz.class },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // B3a: Đánh dấu đã nộp để dừng timer.
      setSubmitted(true);
      alert('Bài kiểm tra đã được nộp thành công!');
      // B3b: Quay lại trang chi tiết lớp/trước đó.
      navigate(-1);
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Lỗi khi nộp bài');
    }
  };

  // Nếu phát hiện chuyển tab thì chặn toàn màn hình bằng cảnh báo (chống gian lận).
  if (tabSwitched) {
    return (
      <div className="tab-warning">
        <div className="warning-box">
          <h2>Cảnh báo</h2>
          <p>Bạn không được rời khỏi trang bài kiểm tra. Vui lòng quay lại trang này để tiếp tục làm bài.</p>
        </div>
      </div>
    );
  }

  // Khi chưa tải xong đề thì hiện chữ chờ.
  if (!quiz) {
    return <div className="main-content"><p>Đang tải bài kiểm tra...</p></div>;
  }

  // HÀM: formatTime(seconds) - đổi giây thành "phút:giây" (ví dụ 65 -> "1:05").
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60); // lấy phút.
    const secs = seconds % 60; // lấy giây lẻ.
    return `${mins}:${secs.toString().padStart(2, '0')}`; // padStart để "5" thành "05".
  };

  return (
    <div className="main-content">
      {/* Thanh tiêu đề + đồng hồ đếm ngược. */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        padding: '1rem',
        background: '#F7F7F7',
        borderRadius: '8px'
      }}>
        {/* Tên đề thi. */}
        <h2>{quiz.title}</h2>
        {/* Đồng hồ: chỉ hiện nếu đề có timeLimit; đỏ khi còn <=5 phút (300s). */}
        {quiz.timeLimit && (
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: timeLeft <= 300 ? '#E63946' : '#333'
          }}>
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Form bài làm: submit cũng gọi handleSubmit (chặn reload). */}
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        {/* Duyệt từng câu hỏi trong đề. */}
        {quiz.questions.map((question, index) => (
          <div key={index} className="quiz-question">
            {/* Tiêu đề câu + số điểm. */}
            <h3>Câu {index + 1}: {question.question}</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
              ({question.points} điểm)
            </p>

            {/* DẠNG 1: Trắc nghiệm - vẽ mỗi option 1 radio. */}
            {question.type === 'multiple-choice' && (
              <div>
                {question.options.map((option, optIndex) => (
                  <div key={optIndex} className="quiz-option">
                    <input
                      type="radio"
                      id={`q${index}-o${optIndex}`} // id duy nhất để label bấm được.
                      name={`question-${index}`} // cùng name = cùng 1 nhóm radio.
                      value={optIndex.toString()}
                      // checked khi đáp án đã lưu khớp option này.
                      checked={answers[index]?.answer === optIndex.toString()}
                      onChange={(e) => handleAnswerChange(index, e.target.value)}
                    />
                    <label htmlFor={`q${index}-o${optIndex}`}>{option}</label>
                  </div>
                ))}
              </div>
            )}

            {/* DẠNG 2: Trả lời ngắn - 1 ô input 1 dòng. */}
            {question.type === 'short-answer' && (
              <input
                type="text"
                value={answers[index]?.answer || ''} // chưa gõ thì rỗng.
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                placeholder="Nhập câu trả lời..."
                style={{ width: '100%', padding: '0.75rem', marginTop: '1rem' }}
              />
            )}

            {/* DẠNG 3: Tự luận - ô textarea nhiều dòng. */}
            {question.type === 'essay' && (
              <textarea
                value={answers[index]?.answer || ''}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                placeholder="Viết câu trả lời của bạn..."
                rows="4"
                style={{ width: '100%', padding: '0.75rem', marginTop: '1rem' }}
              />
            )}
          </div>
        ))}

        {/* 2 nút cuối: Nộp bài (submit) + Hủy (quay lại). */}
        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          <button
            type="submit"
            className="btn btn-success"
            style={{ flex: 1 }}
          >
            Nộp Bài
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => navigate(-1)} // quay lại trang trước mà không nộp.
            style={{ flex: 1 }}
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
};

// Xuất trang để App.js gắn vào Route /quiz/:quizId/take.
export default QuizTaking;
