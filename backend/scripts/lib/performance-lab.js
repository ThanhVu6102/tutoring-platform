const crypto = require('node:crypto');

// Lab chỉ nhận kích thước dữ liệu giả, không nhận URI/token hoặc tên database từ ngoài.
function options(args) {
  const result = { run: false, compareWarningIndexes: false, users: 2000, classes: 400, warnings: 2000, items: 3, samples: 10 };
  const bounds = { users: [100, 20000], classes: [20, 5000], warnings: [0, 20000], items: [1, 10], samples: [3, 50] };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--run') { result.run = true; continue; }
    if (args[i] === '--compare-warning-indexes') { result.compareWarningIndexes = true; continue; }
    if (!args[i].startsWith('--')) throw new Error('Tham số lab phải có tiền tố --');
    const key = args[i].replace(/^--/, '');
    const value = args[++i];
    if (!Object.hasOwn(bounds, key) || !/^\d+$/.test(value || '')) throw new Error('Tham số lab không hợp lệ');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < bounds[key][0] || number > bounds[key][1]) throw new Error('Kích thước lab ngoài giới hạn');
    result[key] = number;
  }
  if (result.classes * result.items > 15000) throw new Error('Dataset vượt ngân sách bộ nhớ của lab');
  return result;
}

function resourceNames(id = crypto.randomBytes(12).toString('hex')) {
  if (!/^[a-f\d]{24}$/.test(id)) throw new Error('Run ID không hợp lệ');
  return { id, container: `tutoring-perf-${id}`, database: `perf_lab_${id}` };
}

function assertOwner(labels, names) {
  const expected = resourceNames(names.id);
  if (names.container !== expected.container || names.database !== expected.database ||
      labels?.['tutoring.lab'] !== 'be04' || labels?.['tutoring.run'] !== names.id) {
    throw new Error('Không xác minh được quyền sở hữu container lab; không xóa tài nguyên');
  }
}

function assertDatabase(actual, names) {
  if (actual !== names.database || actual !== `perf_lab_${names.id}` || !/^perf_lab_[a-f\d]{24}$/.test(actual)) {
    throw new Error('Database không thuộc lần chạy lab; không ghi hoặc xóa');
  }
}

// Danh sách đóng của thí nghiệm, không nhận tên/key index tùy ý từ CLI.
const warningIndexCandidates = [
  { name: 'status_1_appealDeadline_1', key: { status: 1, appealDeadline: 1 } },
  { name: 'issuedAt_-1__id_-1', key: { issuedAt: -1, _id: -1 } },
  { name: 'student_1_issuedAt_-1__id_-1', key: { student: 1, issuedAt: -1, _id: -1 } },
];

function isWarningCandidate(keys) {
  return warningIndexCandidates.some((index) => JSON.stringify(index.key) === JSON.stringify(keys));
}

function phases(compare) {
  return compare
    ? [{ name: 'A1_original_indexes', candidate: false }, { name: 'B1_candidate_indexes', candidate: true },
      { name: 'B2_candidate_indexes', candidate: true }, { name: 'A2_original_indexes', candidate: false }]
    : [{ name: 'without_secondary_indexes' }, { name: 'schema_indexes' }];
}

async function setWarningIndexes(collection, database, names, enabled) {
  assertDatabase(database, names);
  if (collection.collectionName !== 'studentwarnings') throw new Error('Collection không thuộc thí nghiệm cảnh báo');
  const existing = await collection.indexes();
  // Nếu có index trùng tên nhưng khác key thì dừng, không xóa tài nguyên lạ.
  for (const candidate of warningIndexCandidates) {
    const found = existing.find((index) => index.name === candidate.name);
    if (found && JSON.stringify(found.key) !== JSON.stringify(candidate.key)) throw new Error('Index candidate có key không khớp');
  }
  if (enabled) await collection.createIndexes(warningIndexCandidates);
  else {
    for (const index of warningIndexCandidates) {
      if (existing.some((current) => current.name === index.name)) await collection.dropIndex(index.name);
    }
  }
}

function statistics(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Số đo không hợp lệ');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = (sorted.length - 1) / 2;
  return { samples: sorted.length, median: (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2,
    p95: sorted[Math.ceil(sorted.length * .95) - 1], min: sorted[0], max: sorted.at(-1) };
}

// Chỉ dùng command đọc đã thực sự quan sát từ driver. Bỏ lsid/clusterTime và metadata
// của kết nối; không tự viết query khác rồi coi đó là EXPLAIN của route thực tế.
function explainableCommand(event) {
  const command = event.command;
  if (event.commandName === 'find') {
    return Object.fromEntries(['find', 'filter', 'projection', 'sort', 'skip', 'limit', 'hint', 'collation']
      .filter((key) => command[key] !== undefined).map((key) => [key, command[key]]));
  }
  if (event.commandName === 'aggregate') {
    if (command.pipeline.some((step) => Object.hasOwn(step, '$out') || Object.hasOwn(step, '$merge'))) return null;
    return { aggregate: command.aggregate, pipeline: command.pipeline, cursor: {},
      ...(command.hint ? { hint: command.hint } : {}) };
  }
  return null;
}

function planSummary(explain) {
  const cursor = explain.stages?.find((stage) => stage.$cursor)?.$cursor || explain;
  const winning = cursor.queryPlanner?.winningPlan;
  const stats = cursor.executionStats || {};
  const stages = new Set();
  const indexes = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.stage === 'string') stages.add(value.stage);
    if (typeof value.indexName === 'string') indexes.add(value.indexName);
    for (const child of Object.values(value)) visit(child);
  }
  // Không gom rejectedPlans vào kết luận COLLSCAN/SORT của winning plan.
  visit(winning);
  visit(stats.executionStages);
  const externalSort = explain.stages?.some((stage) => Object.hasOwn(stage, '$sort')) || false;
  return { stages: [...stages].sort(), indexes: [...indexes].sort(),
    collectionScan: stages.has('COLLSCAN'), blockingSort: externalSort || stages.has('SORT'),
    nReturned: stats.nReturned, totalDocsExamined: stats.totalDocsExamined,
    totalKeysExamined: stats.totalKeysExamined, executionTimeMillis: stats.executionTimeMillis,
    statisticsScope: explain.stages ? 'aggregation_cursor' : 'query' };
}

// Fixture dành riêng cho đọc dữ liệu/đo API. Bulk insert không chạy hook đăng ký,
// không tạo tài khoản thật; JWT test được runner cấp trong bộ nhớ, không log ra.
function fixtures(mongoose, config) {
  const id = () => new mongoose.Types.ObjectId();
  const date = (i) => new Date(Date.UTC(2026, 0, 1) + i * 60000);
  const teacherCount = Math.min(50, Math.max(5, Math.ceil(config.users / 100)));
  const users = Array.from({ length: config.users }, (_, i) => ({
    _id: id(), name: `Fixture User ${String(i).padStart(6, '0')}`, email: `fixture-${i}@example.test`,
    role: i === 0 ? 'admin' : i <= teacherCount ? 'teacher' : 'student', status: 'active',
    isBlocked: false, deletedAt: null, permanentlyBanned: false, suspendedUntil: null,
    disciplinarySanctions: 0, classRemovalIncidents: 0, enrolledClasses: [],
    avatar: `data:image/png;base64,${Buffer.alloc(1024, 0).toString('base64')}`,
    password: crypto.randomBytes(32).toString('hex'), createdAt: date(i), updatedAt: date(i),
  }));
  const admin = users[0];
  const teachers = users.filter((user) => user.role === 'teacher');
  const students = users.filter((user) => user.role === 'student');
  const classes = Array.from({ length: config.classes }, (_, i) => {
    const members = Array.from({ length: 20 }, (unused, j) => students[(i * 7 + j) % students.length]);
    const classId = id();
    members.forEach((student) => student.enrolledClasses.push(classId));
    return { _id: classId, name: `Fixture Class ${String(i).padStart(6, '0')}`, description: 'Dữ liệu giả của lab',
      teacher: teachers[i % teachers.length]._id, students: members.map((student) => student._id),
      subject: ['Math', 'English', 'Science'][i % 3], grade: String(10 + i % 3), capacity: 50,
      status: i % 5 === 4 ? 'inactive' : 'active', joinCode: `LAB${String(i).padStart(8, '0')}`,
      joinRequests: [], createdAt: date(i), updatedAt: date(i), lockNoticeHistory: [],
      lockNotice: { status: i % 5 === 4 ? 'locked' : i % 10 === 0 ? 'pending' : 'none',
        issuedAt: date(i), reasonCode: 'spam', details: 'Nội dung giả để đo tải',
        appealDeadline: new Date(Date.now() + 86400000) } };
  });
  const data = { User: users, Class: classes, Video: [], Document: [], Assignment: [], Announcement: [], Quiz: [], StudentWarning: [] };
  for (const [i, cls] of classes.entries()) {
    for (let j = 0; j < config.items; j += 1) {
      const base = { class: cls._id, teacher: cls.teacher, title: `Fixture Content ${i}-${j}`,
        description: 'Mô tả giả '.repeat(20), createdAt: date(i * config.items + j) };
      data.Video.push({ ...base, _id: id(), videoUrl: 'https://example.invalid/video', uploadedAt: base.createdAt,
        views: 20, duration: 60, viewedBy: cls.students.map((student) => ({ student, viewedAt: base.createdAt })) });
      data.Document.push({ ...base, _id: id(), fileUrl: 'https://example.invalid/document', fileType: 'pdf',
        fileSize: 1024, uploadedAt: base.createdAt, downloads: 20 });
      data.Assignment.push({ ...base, _id: id(), dueDate: date(i * config.items + j + 1000), totalPoints: 10,
        submissions: cls.students.map((student) => ({ student, fileUrl: 'https://example.invalid/submission', score: 5 })) });
      data.Announcement.push({ ...base, _id: id(), content: 'Nội dung giả '.repeat(30), priority: 'normal', readBy: [] });
      data.Quiz.push({ ...base, _id: id(), status: j % 2 ? 'draft' : 'published', totalPoints: 3,
        promptImage: j % 2 ? null : `data:image/png;base64,${Buffer.alloc(4096, 0).toString('base64')}`,
        questions: Array.from({ length: 3 }, () => ({ _id: id(), question: 'Câu hỏi giả', type: 'multiple-choice',
          options: ['A', 'B'], correctAnswer: 'A', points: 1 })) });
    }
  }
  for (let i = 0; i < config.warnings; i += 1) {
    const cls = classes[i % classes.length];
    const status = ['pending', 'appealed', 'confirmed', 'dismissed'][i % 4];
    data.StudentWarning.push({ _id: id(), student: cls.students[i % cls.students.length], class: cls._id,
      issuedBy: admin._id, status, reasonCode: 'spam', policyLevel: 1, details: 'Cảnh báo giả của lab',
      issuedAt: date(i), appealDeadline: new Date(Date.now() + 7 * 86400000),
      violationCounted: status === 'confirmed', classWarningCount: status === 'confirmed' ? 1 : 0 });
  }
  return { data, admin, teacher: teachers[0], student: students[0], cls: classes[0] };
}

module.exports = { options, resourceNames, assertOwner, assertDatabase, statistics, explainableCommand, planSummary, fixtures,
  phases, isWarningCandidate, setWarningIndexes };
