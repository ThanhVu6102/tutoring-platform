const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assignmentSubmissionInput, assignmentGradeInput } = require('../utils/assignmentValidation');
const studentId = 'a'.repeat(24);

test('bài tập chỉ nhận URL HTTP(S), không ép sai kiểu hoặc thực thi scheme khác', () => {
  for (const body of [null, [], {}, { fileUrl: null }, { fileUrl: [] }, { fileUrl: true },
    { fileUrl: '' }, { fileUrl: '   ' }, { fileUrl: 'not-a-url' }, { fileUrl: '/relative.pdf' },
    { fileUrl: 'javascript:alert(1)' }, { fileUrl: 'data:text/plain,test' }, { fileUrl: 'file:///test' }]) {
    assert.throws(() => assignmentSubmissionInput(body), (error) => error.statusCode === 400);
  }
  assert.equal(assignmentSubmissionInput({ fileUrl: ' https://example.test/bai.pdf ' }), 'https://example.test/bai.pdf');
  assert.equal(assignmentSubmissionInput({ fileUrl: 'http://example.test/bai.pdf' }), 'http://example.test/bai.pdf');
});

test('điểm bài tập validate số hữu hạn, giới hạn thang điểm, ID và nhận xét', () => {
  for (const score of [undefined, null, '', '5', true, [], {}, NaN, Infinity, -Infinity, -1, 10.01]) {
    assert.throws(() => assignmentGradeInput({ studentId, score }, 10), (error) => error.statusCode === 400);
  }
  for (const body of [null, [], { studentId: 'invalid', score: 5 }, { studentId, score: 5, feedback: {} }]) {
    assert.throws(() => assignmentGradeInput(body, 10), (error) => error.statusCode === 400);
  }
  assert.deepEqual(assignmentGradeInput({ studentId: studentId.toUpperCase(), score: 0, feedback: '' }, 10),
    { studentId, score: 0, feedback: '' });
  assert.equal(assignmentGradeInput({ studentId, score: 10 }, 10).score, 10);
  assert.equal(assignmentGradeInput({ studentId, score: 2.5 }, 10).score, 2.5);
  assert.equal(assignmentGradeInput({ studentId, score: 0 }, 0).score, 0);
});
