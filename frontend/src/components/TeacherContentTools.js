import React, { useState } from 'react';
import axios from 'axios';

const blankQuestion = () => ({
  type: 'multiple-choice',
  question: '',
  options: ['', '', '', ''],
  correctAnswer: '0',
  points: 1,
});

const isWebUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch (_) {
    return false;
  }
};

const getYoutubeThumbnail = (value) => {
  try {
    const videoUrl = new URL(value);
    const host = videoUrl.hostname.replace(/^www\./, '').toLowerCase();
    let videoId = '';
    if (host === 'youtu.be') videoId = videoUrl.pathname.slice(1).split('/')[0];
    if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      videoId = videoUrl.searchParams.get('v') || videoUrl.pathname.split('/').filter(Boolean).pop();
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : '';
  } catch (_) {
    return '';
  }
};

const TeacherContentTools = ({ classId, onCreated }) => {
  const [activeTool, setActiveTool] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [video, setVideo] = useState({ title: '', description: '', videoUrl: '' });
  const [document, setDocument] = useState({ title: '', description: '', fileUrl: '', fileType: 'pdf' });
  const [quiz, setQuiz] = useState({
    title: '',
    description: '',
    timeLimit: '',
    dueDate: '',
    publishNow: true,
    promptImage: '',
    questions: [blankQuestion()],
  });
  const [quizMode, setQuizMode] = useState('form');

  const selectTool = (tool) => {
    setActiveTool(activeTool === tool ? '' : tool);
    setError('');
    setNotice('');
  };

  const handleVideoSubmit = async (event) => {
    event.preventDefault();
    if (!isWebUrl(video.videoUrl)) {
      setError('Vui lòng nhập URL video bắt đầu bằng http:// hoặc https://.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await axios.post('/api/videos', {
        ...video,
        classId,
        thumbnail: getYoutubeThumbnail(video.videoUrl),
      });
      setVideo({ title: '', description: '', videoUrl: '' });
      setActiveTool('');
      setNotice('Đã đăng video vào lớp.');
      onCreated('videos');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể đăng video.');
    } finally {
      setBusy(false);
    }
  };

  const handleDocumentSubmit = async (event) => {
    event.preventDefault();
    if (!isWebUrl(document.fileUrl)) {
      setError('Vui lòng nhập URL tài liệu bắt đầu bằng http:// hoặc https://.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await axios.post('/api/documents', { ...document, classId });
      setDocument({ title: '', description: '', fileUrl: '', fileType: 'pdf' });
      setActiveTool('');
      setNotice('Đã thêm tài liệu vào lớp.');
      onCreated('documents');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể thêm tài liệu.');
    } finally {
      setBusy(false);
    }
  };

  const updateQuestion = (index, updates) => {
    setQuiz((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...updates } : question
      ),
    }));
  };

  const handlePromptImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Ảnh đề cần ở định dạng JPG, PNG hoặc WebP.');
      event.target.value = '';
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Ảnh đề cần nhỏ hơn 4 MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setQuiz((current) => ({ ...current, promptImage: reader.result }));
      setError('');
    };
    reader.onerror = () => setError('Không đọc được tệp ảnh.');
    reader.readAsDataURL(file);
  };

  const handleQuizSubmit = async (event) => {
    event.preventDefault();
    if (quizMode === 'image' && !quiz.promptImage) {
      setError('Tải ảnh đề lên trước khi tạo bài kiểm tra ở chế độ ảnh.');
      return;
    }
    const questions = quizMode === 'image'
      ? [{ type: 'essay', question: 'Bài làm của em', options: [], points: 1 }]
      : quiz.questions;
    const invalidQuestion = quizMode === 'form' && questions.find((question) => {
      if (!question.question.trim()) return true;
      return question.type === 'multiple-choice'
        && (question.options.filter((option) => option.trim()).length < 2
          || !question.options[Number(question.correctAnswer)]?.trim());
    });
    if (invalidQuestion) {
      setError('Hoàn thiện nội dung câu hỏi, các lựa chọn và đáp án đúng trước khi lưu.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const payload = {
        title: quiz.title,
        description: quiz.description,
        classId,
        promptImage: quiz.promptImage,
        questions: questions.map((question) => ({
          ...question,
          options: question.type === 'multiple-choice'
            ? question.options.filter((option) => option.trim())
            : [],
          points: Number(question.points) || 1,
        })),
        timeLimit: quiz.timeLimit ? Number(quiz.timeLimit) : null,
        dueDate: quiz.dueDate || undefined,
      };
      const response = await axios.post('/api/quizzes', payload);
      if (quiz.publishNow) {
        try {
          await axios.put(`/api/quizzes/${response.data.quiz._id}/publish`);
        } catch (publishError) {
          setNotice('Đề đã lưu ở bản nháp nhưng chưa thể xuất bản.');
          onCreated('quizzes');
          setActiveTool('');
          return;
        }
      }
      setQuiz({
        title: '', description: '', timeLimit: '', dueDate: '', publishNow: true,
        promptImage: '', questions: [blankQuestion()],
      });
      setQuizMode('form');
      setActiveTool('');
      setNotice(quiz.publishNow ? 'Đã tạo và xuất bản bài kiểm tra.' : 'Đã lưu bài kiểm tra ở bản nháp.');
      onCreated('quizzes');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tạo bài kiểm tra.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="teacher-tools">
      <div className="teacher-tools-heading">
        <div>
          <h3>Học liệu lớp học</h3>
          <p>Đăng video, tài liệu hoặc tạo bài kiểm tra.</p>
        </div>
        <div className="teacher-tools-actions">
          <button type="button" className={activeTool === 'video' ? 'tool-action is-active' : 'tool-action'} onClick={() => selectTool('video')}>Đăng video</button>
          <button type="button" className={activeTool === 'document' ? 'tool-action is-active' : 'tool-action'} onClick={() => selectTool('document')}>Thêm tài liệu</button>
          <button type="button" className={activeTool === 'quiz' ? 'tool-action is-active' : 'tool-action'} onClick={() => selectTool('quiz')}>Tạo bài kiểm tra</button>
        </div>
      </div>

      {error && <div className="admin-alert" role="alert">{error}</div>}
      {notice && <div className="tool-notice" role="status">{notice}</div>}

      {activeTool === 'video' && (
        <form className="tool-form" onSubmit={handleVideoSubmit}>
          <h4>Đăng video bằng URL</h4>
          <div className="tool-form-grid">
            <label>Tiêu đề<input value={video.title} onChange={(event) => setVideo({ ...video, title: event.target.value })} required /></label>
            <label>URL video<input type="url" value={video.videoUrl} onChange={(event) => setVideo({ ...video, videoUrl: event.target.value })} placeholder="https://www.youtube.com/watch?v=..." required /></label>
            <label className="tool-wide">Mô tả<textarea rows="2" value={video.description} onChange={(event) => setVideo({ ...video, description: event.target.value })} /></label>
          </div>
          {getYoutubeThumbnail(video.videoUrl) && <img className="youtube-preview" src={getYoutubeThumbnail(video.videoUrl)} alt="Thumbnail YouTube" />}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Đang đăng...' : 'Đăng video'}</button>
        </form>
      )}

      {activeTool === 'document' && (
        <form className="tool-form" onSubmit={handleDocumentSubmit}>
          <h4>Thêm tài liệu bằng URL</h4>
          <div className="tool-form-grid">
            <label>Tiêu đề<input value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} required /></label>
            <label>URL tài liệu<input type="url" value={document.fileUrl} onChange={(event) => setDocument({ ...document, fileUrl: event.target.value })} placeholder="https://drive.google.com/..." required /></label>
            <label>Định dạng
              <select value={document.fileType} onChange={(event) => setDocument({ ...document, fileType: event.target.value })}>
                {['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip'].map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="tool-wide">Mô tả<textarea rows="2" value={document.description} onChange={(event) => setDocument({ ...document, description: event.target.value })} /></label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Đang lưu...' : 'Thêm tài liệu'}</button>
        </form>
      )}

      {activeTool === 'quiz' && (
        <form className="tool-form quiz-builder" onSubmit={handleQuizSubmit}>
          <h4>Tạo bài kiểm tra</h4>
          <div className="tool-form-grid">
            <label>Tiêu đề<input value={quiz.title} onChange={(event) => setQuiz({ ...quiz, title: event.target.value })} required /></label>
            <label>Thời gian (phút)<input type="number" min="1" value={quiz.timeLimit} onChange={(event) => setQuiz({ ...quiz, timeLimit: event.target.value })} placeholder="Không giới hạn" /></label>
            <label className="tool-wide">Mô tả / hướng dẫn<textarea rows="2" value={quiz.description} onChange={(event) => setQuiz({ ...quiz, description: event.target.value })} /></label>
            <label>Hạn làm bài<input type="datetime-local" value={quiz.dueDate} onChange={(event) => setQuiz({ ...quiz, dueDate: event.target.value })} /></label>
            <label className="image-upload">Ảnh đề (JPG, PNG, WebP; tối đa 4 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePromptImage} /></label>
          </div>
          {quiz.promptImage && <img className="exam-image-preview" src={quiz.promptImage} alt="Ảnh đề đã tải lên" />}

          <div className="quiz-mode-control" role="group" aria-label="Cách tạo đề">
            <button type="button" aria-pressed={quizMode === 'form'} className={quizMode === 'form' ? 'is-selected' : ''} onClick={() => setQuizMode('form')}>Tạo form câu hỏi</button>
            <button type="button" aria-pressed={quizMode === 'image'} className={quizMode === 'image' ? 'is-selected' : ''} onClick={() => setQuizMode('image')}>Dùng ảnh đề</button>
          </div>

          {quizMode === 'form' && (
            <>
              <div className="question-builder-heading">
                <div><h5>Câu hỏi</h5><p>Chọn loại câu hỏi, nhập điểm và đáp án.</p></div>
                <button className="btn btn-secondary" type="button" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, blankQuestion()] })}>Thêm câu hỏi</button>
              </div>

          {quiz.questions.map((question, index) => (
            <fieldset className="question-editor" key={index}>
              <legend>Câu {index + 1}</legend>
              <div className="question-editor-top">
                <label>Loại câu hỏi
                  <select
                    value={question.type}
                    onChange={(event) => updateQuestion(index, {
                      type: event.target.value,
                      options: event.target.value === 'multiple-choice' ? ['', '', '', ''] : [],
                      correctAnswer: '0',
                    })}
                  >
                    <option value="multiple-choice">Trắc nghiệm</option>
                    <option value="essay">Tự luận</option>
                    <option value="short-answer">Trả lời ngắn</option>
                  </select>
                </label>
                <label>Điểm<input type="number" min="1" value={question.points} onChange={(event) => updateQuestion(index, { points: event.target.value })} /></label>
                {quiz.questions.length > 1 && <button className="question-remove" type="button" onClick={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_, itemIndex) => itemIndex !== index) })}>Xóa câu</button>}
              </div>
              <label>Nội dung câu hỏi<textarea rows="2" value={question.question} onChange={(event) => updateQuestion(index, { question: event.target.value })} required /></label>
              {question.type === 'multiple-choice' && (
                <div className="answer-options">
                  <p>Đánh dấu đáp án đúng:</p>
                  {question.options.map((option, optionIndex) => (
                    <div className="answer-option-row" key={optionIndex}>
                      <input aria-label={`Chọn đáp án đúng ${optionIndex + 1}`} type="radio" name={`correct-${index}`} checked={question.correctAnswer === String(optionIndex)} onChange={() => updateQuestion(index, { correctAnswer: String(optionIndex) })} />
                      <input aria-label={`Nội dung đáp án ${optionIndex + 1}`} value={option} onChange={(event) => {
                        const options = question.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item);
                        updateQuestion(index, { options });
                      }} placeholder={`Lựa chọn ${optionIndex + 1}`} required />
                      {question.options.length > 2 && <button type="button" className="option-remove" aria-label={`Xóa lựa chọn ${optionIndex + 1}`} onClick={() => {
                        const options = question.options.filter((_, itemIndex) => itemIndex !== optionIndex);
                        const correctIndex = Number(question.correctAnswer);
                        updateQuestion(index, {
                          options,
                          correctAnswer: String(correctIndex === optionIndex ? 0 : correctIndex > optionIndex ? correctIndex - 1 : correctIndex),
                        });
                      }}>×</button>}
                    </div>
                  ))}
                  {question.options.length < 6 && <button className="option-add" type="button" onClick={() => updateQuestion(index, { options: [...question.options, ''] })}>+ Thêm lựa chọn</button>}
                </div>
              )}
              {question.type !== 'multiple-choice' && <p className="manual-grade-note">Câu trả lời sẽ được giáo viên chấm thủ công.</p>}
            </fieldset>
          ))}
            </>
          )}
          {quizMode === 'image' && <p className="manual-grade-note">Học sinh sẽ xem ảnh đề và nộp bài tự luận để giáo viên chấm.</p>}

          <label className="publish-toggle"><input type="checkbox" checked={quiz.publishNow} onChange={(event) => setQuiz({ ...quiz, publishNow: event.target.checked })} /> Xuất bản để học sinh làm ngay</label>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Đang lưu...' : quiz.publishNow ? 'Tạo và xuất bản' : 'Lưu bản nháp'}</button>
        </form>
      )}
    </section>
  );
};

export default TeacherContentTools;