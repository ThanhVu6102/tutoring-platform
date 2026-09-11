const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tutoring-platform', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/announcements', require('./routes/announcements'));

// API Documentation
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'Tutoring Platform API',
    version: '1.0.0',
    baseURL: process.env.API_URL || 'http://localhost:5000',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout'
      },
      classes: {
        create: 'POST /api/classes',
        getAll: 'GET /api/classes',
        getById: 'GET /api/classes/:id',
        update: 'PUT /api/classes/:id',
        delete: 'DELETE /api/classes/:id',
        enroll: 'POST /api/classes/:id/enroll',
        getStudents: 'GET /api/classes/:id/students'
      },
      quizzes: {
        create: 'POST /api/quizzes',
        getAll: 'GET /api/quizzes',
        submit: 'POST /api/quizzes/:id/submit'
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
