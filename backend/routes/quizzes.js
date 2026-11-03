const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const classAvailability = require('../middleware/classAvailability');
const Quiz = require('../models/Quiz');
const QuizSubmission = require('../models/QuizSubmission');
const { readPage, objectId } = require('../utils/pagination');

const router = express.Router();
// Lọc cả hồ sơ giáo viên trong đề thi và hồ sơ học sinh trong danh sách bài nộp.
router.use(require('../middleware/userPrivacy'));
const { USER_POPULATE_FIELDS } = require('../utils/userPrivacy');

const quizForStudent = (quiz) => {
  const data = quiz.toObject();
  data.questions = data.questions.map(({ correctAnswer, ...question }) => question);
  return data;
};

// Create quiz (teacher only)
router.post('/', authMiddleware, classAvailability(Quiz), teacherOnly, async (req, res) => {
  try {
    const { title, description, classId, questions, promptImage, timeLimit, dueDate, allowReview, shuffleQuestions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'A quiz needs at least one question' });
    }
    if (promptImage && (!promptImage.startsWith('data:image/') || promptImage.length > 6_000_000)) {
      return res.status(400).json({ message: 'Exam image must be an image smaller than 4 MB' });
    }

    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

    const quiz = new Quiz({
      title,
      description,
      promptImage,
      class: classId,
      teacher: req.userId,
      questions,
      totalPoints,
      timeLimit,
      dueDate,
      allowReview,
      shuffleQuestions,
    });

    await quiz.save();
    res.status(201).json({ message: 'Quiz created successfully', quiz });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get quizzes for a class
router.get('/class/:classId', authMiddleware, classAvailability(Quiz), async (req, res) => {
  try {
    const filter = { class: objectId(req.params.classId) };
    if (req.userRole === 'student') filter.status = 'published';
    // MongoDB chỉ trả số câu/cờ ảnh, không truyền đề, đáp án hay ảnh base64 cho thẻ danh sách.
    res.json(await readPage(Quiz, req, filter, { projection: {
      title: 1, description: 1, class: 1, teacher: 1, totalPoints: 1, timeLimit: 1,
      dueDate: 1, status: 1, createdAt: 1, allowReview: 1,
      questionCount: { $size: { $ifNull: ['$questions', []] } },
      hasPromptImage: { $ne: [{ $ifNull: ['$promptImage', ''] }, ''] },
    } }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get quiz by ID
router.get('/:id', authMiddleware, classAvailability(Quiz), async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).populate('teacher', USER_POPULATE_FIELDS);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (req.userRole === 'student' && quiz.status !== 'published') {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.json(req.userRole === 'student' ? quizForStudent(quiz) : quiz);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Submit quiz answers
router.post('/:id/submit', authMiddleware, classAvailability(Quiz), async (req, res) => {
  try {
    const { answers, classId } = req.body;
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    if (req.userRole !== 'student') {
      return res.status(403).json({ message: 'Only students can submit a quiz' });
    }
    if (quiz.status !== 'published') {
      return res.status(403).json({ message: 'This quiz is not published' });
    }
    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers must be an array' });
    }

    let totalScore = 0;
    const submittedAnswers = answers.map((answer, index) => {
      const question = quiz.questions[index];
      let isCorrect = false;
      let pointsEarned = 0;

      if (question.type === 'multiple-choice') {
        isCorrect = answer.answer === question.correctAnswer;
        pointsEarned = isCorrect ? (question.points || 1) : 0;
      }
      // Essay and short-answer need manual grading
      if (question.type !== 'multiple-choice') {
        pointsEarned = 0; // Will be graded by teacher
      }

      totalScore += pointsEarned;

      return {
        questionId: question._id,
        answer: answer.answer,
        isCorrect,
        pointsEarned,
      };
    });

    const submission = new QuizSubmission({
      quiz: req.params.id,
      student: req.userId,
      class: quiz.class,
      answers: submittedAnswers,
      totalScore,
      maxScore: quiz.totalPoints,
      percentage: (totalScore / quiz.totalPoints) * 100,
      status: 'submitted',
      submittedAt: new Date(),
    });

    await submission.save();
    res.status(201).json({ message: 'Quiz submitted successfully', submission });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get student submissions for a quiz
router.get('/:id/submissions', authMiddleware, classAvailability(Quiz), teacherOnly, async (req, res) => {
  try {
    const submissions = await QuizSubmission.find({ quiz: req.params.id }).populate('student', USER_POPULATE_FIELDS);
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Grade essay/short-answer question
router.post('/:quizId/submission/:submissionId/grade', authMiddleware, classAvailability(Quiz), teacherOnly, async (req, res) => {
  try {
    const { questionIndex, score, feedback } = req.body;
    const submission = await QuizSubmission.findById(req.params.submissionId);

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    if (submission.answers[questionIndex]) {
      submission.answers[questionIndex].pointsEarned = score;
    }

    submission.feedback = feedback;
    submission.status = 'graded';
    submission.gradedAt = new Date();

    // Recalculate total score
    submission.totalScore = submission.answers.reduce((sum, a) => sum + a.pointsEarned, 0);
    submission.percentage = (submission.totalScore / submission.maxScore) * 100;

    await submission.save();
    res.json({ message: 'Grade submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Publish quiz (teacher only)
router.put('/:id/publish', authMiddleware, classAvailability(Quiz), teacherOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (quiz.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!quiz.questions.length) {
      return res.status(400).json({ message: 'Add at least one question before publishing' });
    }

    quiz.status = 'published';
    await quiz.save();

    res.json({ message: 'Quiz published' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', authMiddleware, classAvailability(Quiz), teacherOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    if (req.userRole !== 'admin' && quiz.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Promise.all([
      Quiz.deleteOne({ _id: quiz._id }),
      QuizSubmission.deleteMany({ quiz: quiz._id }),
    ]);
    res.json({ message: 'Quiz and submissions deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
