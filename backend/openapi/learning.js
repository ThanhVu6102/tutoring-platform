const { ref, string, number, integer, boolean, date, array, object, enumeration, userRef, body, message, page, paging, operation } = require('./helpers');
const paths = {};
const add = (method, path, tag, summary, schema, options) => {
  paths[path] = { ...paths[path], [method]: operation(method, path, tag, summary, schema, options) };
};
const common = { _id: ref('ObjectId'), title: string(), description: string(), class: ref('ObjectId'), teacher: userRef() };
const httpUrl = string({ format: 'uri', pattern: '^https?://', example: 'https://example.test/lesson.pdf' });
const question = { _id: ref('ObjectId'), type: enumeration(['multiple-choice', 'essay', 'short-answer']),
  question: string({ maxLength: 5000 }), options: array(string()), points: number({ minimum: 0, default: 1 }) };
const questionInput = object({ ...question, correctAnswer: string({ description: 'Multiple choice stores an option index as a string, e.g. "0". Written answers are manually graded.' }) }, ['type', 'question']);
const quizMeta = { ...common, totalPoints: number(), timeLimit: number({ nullable: true, description: 'Minutes; frontend countdown, not an API enforcement guarantee.' }),
  dueDate: date(), allowReview: boolean(), shuffleQuestions: boolean(), status: enumeration(['draft', 'published', 'closed']), createdAt: date(), updatedAt: date() };
const assignmentMeta = { ...common, dueDate: date(), totalPoints: number({ minimum: 0, default: 100 }), createdAt: date() };
const assignmentSubmission = object({ _id: ref('ObjectId'), student: userRef(), fileUrl: string(), submittedAt: date(), isLate: boolean(), score: number(), feedback: string(), gradedAt: date() });
const videoMeta = { ...common, videoUrl: string(), duration: number(), thumbnail: string({ nullable: true }), views: number(), uploadedAt: date() };
const documentMeta = { ...common, fileUrl: string(), fileType: enumeration(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip']), fileSize: number(), downloads: number(), uploadedAt: date() };
const announcementMeta = { _id: ref('ObjectId'), title: string(), content: string(), class: ref('ObjectId'), teacher: userRef(),
  priority: enumeration(['low', 'normal', 'high']), createdAt: date(), updatedAt: date() };
const schemas = {
  LearningVideoListItem: object(videoMeta),
  LearningVideo: object({ ...videoMeta, viewedBy: array(object({ _id: ref('ObjectId'), student: userRef(), viewedAt: date(), duration: number() })) }),
  LearningDocument: object(documentMeta),
  LearningAnnouncementListItem: object(announcementMeta),
  LearningAnnouncement: object({ ...announcementMeta, readBy: array(object({ _id: ref('ObjectId'), student: userRef(), readAt: date() })) }),
  LearningQuestionInput: questionInput,
  LearningStudentQuiz: object({ ...quizMeta, promptImage: string(), questions: array(object(question)) }),
  LearningManagerQuiz: object({ ...quizMeta, promptImage: string(), questions: array(questionInput) }),
  LearningQuizListItem: object({ ...quizMeta, questionCount: integer(), hasPromptImage: boolean() }),
  LearningQuizSubmission: object({ _id: ref('ObjectId'), quiz: ref('ObjectId'), class: ref('ObjectId'), student: userRef(),
    answers: array(object({ _id: ref('ObjectId'), questionId: ref('ObjectId'), answer: string(), isCorrect: boolean(), pointsEarned: number() })),
    totalScore: number(), maxScore: number(), percentage: number(), status: enumeration(['in-progress', 'submitted', 'graded']),
    startedAt: date(), submittedAt: date(), gradedAt: date(), feedback: string() }),
  LearningAssignmentListItem: object(assignmentMeta),
  LearningAssignment: object({ ...assignmentMeta, submissions: array(assignmentSubmission) }),
};
const managers = { roles: ['teacher', 'admin'] };
const access = 'Authenticated class access: enrolled student, responsible teacher, or admin. Non-admins are denied when the class is inactive. Populated users are filtered for the viewer.';
const writeAccess = 'Responsible teacher or admin with class access. The API stores URL/metadata, not uploaded binary files. Some legacy schema-validation errors return 500; no new validation is implied by this documentation.';

for (const config of [
  { resource: 'videos', tag: 'Videos', name: 'video', model: 'LearningVideo', list: 'LearningVideoListItem',
    properties: { title: string(), description: string(), classId: ref('ObjectId'), videoUrl: httpUrl, duration: number({ default: 0, description: 'Seconds.' }), thumbnail: string({ nullable: true }) },
    required: ['title', 'classId', 'videoUrl'], example: { title: 'Example lesson', classId: '507f1f77bcf86cd799439011', videoUrl: 'https://example.test/lesson.mp4', duration: 600 } },
  { resource: 'documents', tag: 'Documents', name: 'document', model: 'LearningDocument', list: 'LearningDocument',
    properties: { title: string(), description: string(), classId: ref('ObjectId'), fileUrl: httpUrl, fileType: documentMeta.fileType, fileSize: number({ default: 0, description: 'Client-declared bytes; not measured by the server.' }) },
    required: ['title', 'classId', 'fileUrl', 'fileType'], example: { title: 'Example notes', classId: '507f1f77bcf86cd799439011', fileUrl: 'https://example.test/lesson.pdf', fileType: 'pdf', fileSize: 1024 } },
  { resource: 'announcements', tag: 'Announcements', name: 'announcement', model: 'LearningAnnouncement', list: 'LearningAnnouncementListItem',
    properties: { title: string({ maxLength: 255 }), content: string({ maxLength: 10000 }), classId: ref('ObjectId'), priority: enumeration(['low', 'normal', 'high'], { default: 'normal' }) },
    required: ['title', 'classId', 'content'], example: { title: 'Next lesson', content: 'Please review chapter one.', classId: '507f1f77bcf86cd799439011', priority: 'normal' } },
]) {
  const { resource, tag, name, model, list, properties, required, example } = config;
  add('post', `/api/${resource}`, tag, `Create a ${name}`, message({ [name]: ref(model) }), {
    ...managers, status: 201, description: writeAccess + (resource === 'videos' ? ' Supported YouTube URLs generate a thumbnail when possible.' : ''),
    requestBody: body(object(properties, required), example),
  });
  add('get', `/api/${resource}/class/{classId}`, tag, `List class ${resource}`, page(ref(list)), {
    description: `${access} Paginated metadata; ${resource === 'videos' ? 'viewedBy is excluded; sorted by uploadedAt descending.' : resource === 'announcements' ? 'readBy is excluded; newest first.' : 'sorted by uploadedAt descending.'}`,
    parameters: paging(),
  });
  add('get', `/api/${resource}/{id}`, tag, `Read a ${name}`, ref(model), { description: access });
  add('delete', `/api/${resource}/{id}`, tag, `Delete a ${name}`, ref('Message'), { ...managers,
    description: resource === 'announcements'
      ? 'Requires class access and the original announcement author. The route checks author ID even for admins.'
      : 'Requires class access and the original resource author, or administrator role. Deletes the metadata only, not the external hosted file.',
  });
}
add('post', '/api/videos/{id}/view', 'Videos', 'Record or update your video view', ref('Message'), {
  description: `${access} Adds a unique viewer or updates its duration/timestamp; total views increments only for a new viewer.`,
  requestBody: body(object({ duration: number({ description: 'Viewed duration in seconds.' }) }), { duration: 120 }, false),
});
add('post', '/api/documents/{id}/download', 'Documents', 'Record a download event', ref('Message'), {
  description: `${access} Increments the counter; does not stream the file or issue a signed URL. No body required.`,
});
add('post', '/api/announcements/{id}/read', 'Announcements', 'Mark an announcement as read', ref('Message'), {
  description: `${access} Uses the authenticated identity; repeated reads do not duplicate readBy. No body required.`,
});
add('put', '/api/announcements/{id}', 'Announcements', 'Update an announcement', ref('Message'), {
  ...managers, description: 'Class access and original author or admin. Only nonempty title, content and priority values are applied.',
  requestBody: body(object({ title: string({ maxLength: 255 }), content: string({ maxLength: 10000 }), priority: announcementMeta.priority }), { title: 'Updated notice', priority: 'high' }),
});

add('post', '/api/assignments', 'Assignments', 'Create an assignment', message({ assignment: ref('LearningAssignment') }), {
  ...managers, status: 201, description: writeAccess,
  requestBody: body(object({ title: string({ maxLength: 255 }), description: string({ maxLength: 10000 }), classId: ref('ObjectId'),
    dueDate: date(), totalPoints: number({ minimum: 0, default: 100 }) }, ['title', 'classId', 'dueDate']),
  { title: 'Example homework', classId: '507f1f77bcf86cd799439011', dueDate: '2027-01-15T16:00:00Z', totalPoints: 10 }),
});
add('get', '/api/assignments/class/{classId}', 'Assignments', 'List assignments without submissions', page(ref('LearningAssignmentListItem')), {
  description: `${access} Only metadata is returned; sorted by dueDate and _id ascending.`, parameters: paging(),
});
add('get', '/api/assignments/{id}', 'Assignments', 'Read assignment and permitted submissions', ref('LearningAssignment'), {
  description: `${access} Students receive only their own submissions (empty array if none). Responsible teacher/admin can see all. Class must exist, including for admin.`,
});
add('post', '/api/assignments/{id}/submit', 'Assignments', 'Submit or replace your assignment URL', ref('Message'), {
  roles: ['student'], description: 'Enrolled student only. HTTP(S) link, not an upload. Replaces the caller’s existing URL/timestamp without removing peers’ submissions. Late submissions are accepted and flagged isLate; no server deadline cutoff is enforced here.',
  requestBody: body(object({ fileUrl: httpUrl }, ['fileUrl']), { fileUrl: 'https://example.test/my-homework.pdf' }),
});
add('post', '/api/assignments/{id}/grade', 'Assignments', 'Grade an existing assignment submission', ref('Message'), {
  ...managers, description: 'Responsible teacher/admin. studentId must identify an existing submission. score is a finite JSON number from 0 to assignment.totalPoints; numeric strings are rejected.',
  requestBody: body(object({ studentId: ref('ObjectId'), score: number({ minimum: 0, description: 'Cannot exceed this assignment’s totalPoints.' }), feedback: string() }, ['studentId', 'score']),
    { studentId: '507f1f77bcf86cd799439012', score: 8, feedback: 'Good work.' }),
});
add('delete', '/api/assignments/{id}', 'Assignments', 'Delete an assignment', ref('Message'), {
  ...managers, description: 'Requires class access and assignment author or admin. Deletes the assignment and embedded submissions, not externally hosted files.',
});

add('post', '/api/quizzes', 'Quizzes', 'Create a draft quiz', message({ quiz: ref('LearningManagerQuiz') }), {
  ...managers, status: 201, description: `${writeAccess} Requires at least one question. totalPoints is computed from question points. promptImage, if present, must start with data:image/ and be at most 6,000,000 characters.`,
  requestBody: body(object({ title: string(), description: string(), classId: ref('ObjectId'), questions: { ...array(ref('LearningQuestionInput')), minItems: 1 },
    promptImage: string({ maxLength: 6000000 }), timeLimit: number({ nullable: true }), dueDate: date(), allowReview: boolean({ default: true }), shuffleQuestions: boolean({ default: false }) }, ['title', 'classId', 'questions']),
  { title: 'Example quiz', classId: '507f1f77bcf86cd799439011', questions: [{ type: 'multiple-choice', question: '2 + 2 = ?', options: ['4', '5'], correctAnswer: '0', points: 5 }], timeLimit: 15 }),
});
add('get', '/api/quizzes/class/{classId}', 'Quizzes', 'List quiz metadata for a class', page(ref('LearningQuizListItem')), {
  description: `${access} Students see published quizzes only. Metadata includes questionCount/hasPromptImage; questions, answers and promptImage are excluded.`, parameters: paging(),
});
add('get', '/api/quizzes/{id}', 'Quizzes', 'Read a quiz with role-filtered questions', { anyOf: [ref('LearningStudentQuiz'), ref('LearningManagerQuiz')] }, {
  description: `${access} Students receive only published quizzes and questions without correctAnswer. The current route does not reveal correctAnswer after submission. Teachers/admin receive stored questions.`,
});
add('post', '/api/quizzes/{id}/submit', 'Quizzes', 'Submit quiz answers in question order', message({ submission: ref('LearningQuizSubmission') }), {
  roles: ['student'], status: 201, description: 'Enrolled student; quiz must be published. Answers are matched by ARRAY POSITION, not questionId. Multiple-choice strings are compared exactly to correctAnswer; essay/short-answer start at zero pending manual grading. Send no more answers than questions. timeLimit/dueDate/one-attempt are not enforced by this handler; extra answers may produce a legacy 500 error. class comes from the quiz; omit classId.',
  requestBody: body(object({ answers: array(object({ answer: string({ description: 'Option index as string or written response.' }) }, ['answer'])) }, ['answers']), { answers: [{ answer: '0' }] }),
});
add('get', '/api/quizzes/{id}/submissions', 'Quizzes', 'List all submissions for a quiz', array(ref('LearningQuizSubmission')), {
  ...managers, description: 'Class manager/admin; unpaginated array. Student profiles populated with public fields for teachers and private allowlist for admins.',
});
add('post', '/api/quizzes/{quizId}/submission/{submissionId}/grade', 'Quizzes', 'Grade one question in a scoped submission', ref('Message'), {
  ...managers, errors: [400, 401, 403, 404, 409, 423, 500, 503], description: 'Responsible class teacher or admin. Query binds submissionId, quizId and quiz.class; unrelated submissions cannot be graded. questionIndex is zero-based; score cannot exceed that question’s points or the submission’s maxScore. Admin may grade inactive classes. Updates overall feedback and recomputes total/percentage.',
  requestBody: body(object({ questionIndex: integer({ minimum: 0 }), score: number({ minimum: 0 }), feedback: string() }, ['questionIndex', 'score']), { questionIndex: 0, score: 4, feedback: 'Reviewed.' }),
});
add('put', '/api/quizzes/{id}/publish', 'Quizzes', 'Publish a quiz', ref('Message'), {
  ...managers, description: 'Requires at least one question and exact original quiz.teacher ID, even for an administrator. Non-admin class access restrictions also apply. No body required.',
});
add('delete', '/api/quizzes/{id}', 'Quizzes', 'Delete a quiz and its submissions', ref('Message'), {
  ...managers, description: 'Original quiz author or admin, with class access. Removes the quiz and QuizSubmission records.',
});

module.exports = { paths, schemas };
