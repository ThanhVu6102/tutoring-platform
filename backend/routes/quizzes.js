const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const Quiz = require('../models/Quiz');
const QuizSubmission = require('../models/QuizSubmission');

const router = express.Router();

// Create quiz (teacher only)
router.post('/', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { title, description, classId, questions, timeLimit, dueDate, allowReview, shuffleQuestions } = req.body;

    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

    const quiz = new Quiz({
      title,
      description,
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
router.get('/class/:classId', authMiddleware, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ class: req.params.classId });
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get quiz by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).populate('teacher');

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.json(quiz);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Submit quiz answers
router.post('/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { answers, classId } = req.body;
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
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
      class: classId,
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
router.get('/:id/submissions', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const submissions = await QuizSubmission.find({ quiz: req.params.id }).populate('student');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Grade essay/short-answer question
router.post('/:quizId/submission/:submissionId/grade', authMiddleware, teacherOnly, async (req, res) => {
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
router.put('/:id/publish', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    if (quiz.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    quiz.status = 'published';
    await quiz.save();

    res.json({ message: 'Quiz published' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
