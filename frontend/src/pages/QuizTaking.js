import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const QuizTaking = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [tabSwitched, setTabSwitched] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchQuiz();
    
    // Detect tab switching
    const handleVisibilityChange = () => {
      if (document.hidden && !submitted) {
        setTabSwitched(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [quizId, submitted]);

  useEffect(() => {
    if (quiz?.timeLimit && !submitted) {
      setTimeLeft(quiz.timeLimit * 60);
    }
  }, [quiz, submitted]);

  useEffect(() => {
    if (timeLeft === null || submitted) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, submitted]);

  const fetchQuiz = async () => {
    try {
      const response = await axios.get(`/api/quizzes/${quizId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuiz(response.data);
    } catch (error) {
      console.error('Error fetching quiz:', error);
    }
  };

  const handleAnswerChange = (questionIndex, value) => {
    setAnswers({
      ...answers,
      [questionIndex]: { answer: value }
    });
  };

  const handleSubmit = async () => {
    try {
      const submissionAnswers = Object.entries(answers).map(([index, data]) => ({
        questionId: index,
        answer: data.answer
      }));

      await axios.post(`/api/quizzes/${quizId}/submit`,
        { answers: submissionAnswers, classId: quiz.class },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSubmitted(true);
      alert('Bài kiểm tra đã được nộp thành công!');
      navigate(-1);
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Lỗi khi nộp bài');
    }
  };

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

  if (!quiz) {
    return <div className="main-content"><p>Đang tải bài kiểm tra...</p></div>;
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="main-content">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        padding: '1rem',
        background: '#F7F7F7',
        borderRadius: '8px'
      }}>
        <h2>{quiz.title}</h2>
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

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        {quiz.questions.map((question, index) => (
          <div key={index} className="quiz-question">
            <h3>Câu {index + 1}: {question.question}</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
              ({question.points} điểm)
            </p>

            {question.type === 'multiple-choice' && (
              <div>
                {question.options.map((option, optIndex) => (
                  <div key={optIndex} className="quiz-option">
                    <input
                      type="radio"
                      id={`q${index}-o${optIndex}`}
                      name={`question-${index}`}
                      value={optIndex.toString()}
                      checked={answers[index]?.answer === optIndex.toString()}
                      onChange={(e) => handleAnswerChange(index, e.target.value)}
                    />
                    <label htmlFor={`q${index}-o${optIndex}`}>{option}</label>
                  </div>
                ))}
              </div>
            )}

            {question.type === 'short-answer' && (
              <input
                type="text"
                value={answers[index]?.answer || ''}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                placeholder="Nhập câu trả lời..."
                style={{ width: '100%', padding: '0.75rem', marginTop: '1rem' }}
              />
            )}

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
            onClick={() => navigate(-1)}
            style={{ flex: 1 }}
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuizTaking;
