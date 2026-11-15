const { ref, string, integer, number, boolean, date, array, object, enumeration, userRef, body, message, page, query, paging, operation } = require('./helpers');
const paths = {};
const add = (method, path, tag, summary, schema, options) => {
  paths[path] = { ...paths[path], [method]: operation(method, path, tag, summary, schema, options) };
};
const status = enumeration(['scheduled', 'ongoing', 'completed', 'cancelled']);
const attendance = object({ student: ref('ObjectId'), status: enumeration(['present', 'absent', 'late', 'excused']), note: string({ maxLength: 2000 }),
  checkedInAt: date({ nullable: true }), recordedBy: string({ pattern: '^[a-fA-F0-9]{24}$', nullable: true }), updatedAt: date() });
const session = object({ _id: ref('ObjectId'), class: ref('ObjectId'), teacher: ref('ObjectId'), title: string(), location: string(),
  startsAt: date(), endsAt: date(), status, createdBy: ref('ObjectId'), statusChangedBy: string({ pattern: '^[a-fA-F0-9]{24}$', nullable: true }), createdAt: date(), updatedAt: date() });
const classReference = { anyOf: [ref('ObjectId'), object({ _id: ref('ObjectId'), name: string(), subject: string() })], nullable: true };
const warning = object({ _id: ref('ObjectId'), student: userRef(), class: classReference, issuedBy: userRef(), reasonCode: string(), policyLevel: number(),
  details: string(), status: enumeration(['pending', 'appealed', 'confirmed', 'dismissed']), issuedAt: date(), appealDeadline: date(),
  appealMessage: string(), appealedAt: date(), appealedBy: userRef(), resolvedAt: date(), reviewedBy: userRef(), adminResponse: string(),
  violationCounted: boolean(), classWarningCount: integer(), classRemovalApplied: boolean(),
  accountSanction: enumeration(['none', 'suspension_7_days', 'suspension_1_month', 'permanent_ban']), createdAt: date(), updatedAt: date() });
const schemas = { Session: session, Attendance: attendance, StudentWarning: warning };
const managers = { roles: ['teacher', 'admin'] };
const reviewErrors = [400, 401, 403, 404, 409, 423, 500, 503];
const expiry = 'This GET may finalize expired warnings and apply sanctions; a GET is not guaranteed side-effect-free. Finalization requires MongoDB replica set/Atlas transactions and may return 503.';

add('post', '/api/classes/{id}/sessions', 'Sessions', 'Schedule a class session', message({ session: ref('Session') }), {
  ...managers, status: 201, errors: reviewErrors, description: 'Responsible teacher/admin. ISO timestamps MUST include timezone, endsAt after startsAt. Rejects overlap with non-cancelled sessions of the same teacher. Snapshots current students for attendance. Requires a MongoDB replica set/Atlas transaction.',
  requestBody: body(object({ title: string({ maxLength: 255 }), location: string({ maxLength: 1000 }), startsAt: date(), endsAt: date() }, ['startsAt', 'endsAt']),
    { title: 'Example session', location: 'Online', startsAt: '2027-01-10T12:00:00Z', endsAt: '2027-01-10T13:00:00Z' }),
});
add('get', '/api/classes/{id}/sessions', 'Sessions', 'List class sessions', object({ items: array(ref('Session')), page: integer(), limit: integer(), total: integer() }, ['items', 'page', 'limit', 'total']), {
  description: 'Responsible teacher/admin or enrolled student; students cannot read inactive classes. Attendances are excluded. Unlike other lists this route returns items (no totalPages), sorted by startsAt ascending. Out-of-range paging is REJECTED, not capped.',
  parameters: [query('page', integer({ minimum: 1, maximum: 100000, default: 1 }), 'Positive integer ≤ 100000; invalid/out-of-range returns 400.'),
    query('limit', integer({ minimum: 1, maximum: 100, default: 20 }), 'Positive integer ≤ 100; invalid/out-of-range returns 400.')],
});
add('get', '/api/sessions/{id}', 'Sessions', 'Read a session without attendance rows', ref('Session'), {
  description: 'Responsible teacher/admin or enrolled student. Attendance data is available separately and filtered for the viewer.',
});
add('put', '/api/sessions/{id}/status', 'Sessions', 'Change session state', message({ session: ref('Session') }), {
  ...managers, errors: reviewErrors, description: 'Responsible teacher/admin on an active class. scheduled → ongoing/completed/cancelled; ongoing → completed/cancelled. Terminal states cannot reopen; stale/unsupported transitions return 409.',
  requestBody: body(object({ status }, ['status']), { status: 'ongoing' }),
});
add('get', '/api/sessions/{id}/attendances', 'Sessions', 'Read permitted attendance rows', object({ items: array(ref('Attendance')) }, ['items']), {
  description: 'Manager/admin gets all rows. Enrolled student receives only their own row, without note or recordedBy. No pagination.',
});
add('post', '/api/sessions/{id}/check-in', 'Sessions', 'Record attendance for a student', message({ attendance: ref('Attendance') }), {
  ...managers, errors: reviewErrors, description: 'Responsible teacher/admin; session ongoing/completed, class active. Student must be both currently enrolled and in the session snapshot. present/late set checkedInAt; absent/excused clear it.',
  requestBody: body(object({ student_id: ref('ObjectId'), status: enumeration(['present', 'absent', 'late', 'excused']), note: string({ maxLength: 2000 }) }, ['student_id', 'status']),
    { student_id: '507f1f77bcf86cd799439012', status: 'present', note: '' }),
});
add('post', '/api/student-warnings/{studentId}', 'StudentWarnings', 'Issue a warning to a current class student', message({ warning: ref('StudentWarning') }), {
  roles: ['admin'], status: 201, errors: reviewErrors, description: 'Class must be active and student currently enrolled. Opens a seven-day appeal deadline. Issuer/identity/timestamps are derived server-side.',
  requestBody: body({ allOf: [ref('NoticeInput'), object({ classId: ref('ObjectId') }, ['classId'])] },
    { classId: '507f1f77bcf86cd799439011', reasonCode: 'class_disruption', policyLevel: 1, details: 'Example classroom incident for review.' }),
});
add('get', '/api/student-warnings/mine', 'StudentWarnings', 'Read your warning history', array(ref('StudentWarning')), {
  roles: ['student'], errors: reviewErrors, description: `Student only; an unpaginated array. Class and issuer are populated; issuer private profile fields are filtered. ${expiry}`,
});
add('get', '/api/student-warnings', 'StudentWarnings', 'Read the legacy administrator warning list', array(ref('StudentWarning')), {
  roles: ['admin'], errors: reviewErrors, description: `Unpaginated legacy list. Unsupported status values are ignored here (the paginated moderation list instead rejects them). ${expiry}`,
  parameters: [query('status', enumeration(['pending', 'appealed', 'confirmed', 'dismissed']), 'Optional warning state.')],
});
add('post', '/api/student-warnings/{warningId}/appeal', 'StudentWarnings', 'Appeal your own eligible warning', message({ warning: ref('StudentWarning') }), {
  roles: ['student'], errors: reviewErrors, description: 'Only the affected student may appeal a pending warning before the recorded seven-day deadline. Missing, invalid, expired, or already-decided state is rejected.',
  requestBody: body(ref('AppealInput'), { message: 'Please review the circumstances of this incident.' }),
});
add('patch', '/api/student-warnings/{warningId}/review', 'StudentWarnings', 'Confirm or dismiss a warning', message({ warning: ref('StudentWarning') }), {
  roles: ['admin'], errors: reviewErrors, description: 'Records reviewer/decision/response. Confirmation may update sanctions or remove class membership; transactional work requires replica set/Atlas. Competing/invalid terminal-state changes return 409.',
  requestBody: body(object({ decision: enumeration(['confirm', 'dismiss']), response: string({ maxLength: 2000 }) }, ['decision']), { decision: 'dismiss', response: 'The warning has been reviewed.' }),
});
add('get', '/api/moderation/summary', 'Moderation', 'Read exact moderation totals', object({ totalWarnings: integer(), openWarnings: integer(), violationClasses: integer() }), {
  roles: ['admin'], errors: reviewErrors, description: `Administrator only. Totals cover all records, not the current page. openWarnings counts pending/appealed. ${expiry}`,
});
for (const [section, item] of [['warnings', ref('StudentWarning')], ['students', ref('PrivateUser')], ['classes', ref('ClassApiListItem')]]) {
  add('get', `/api/moderation/${section}`, 'Moderation', `Read paginated moderation ${section}`, page(item), {
    roles: ['admin'], errors: reviewErrors, description: `Administrator only. Compact projections; user DTO allowlists apply. ${section === 'students'
      ? 'Includes non-deleted students with warning/sanction evidence; no avatar or heavy profile fields.'
      : section === 'classes' ? 'Includes inactive classes or a current non-none lock notice; does not include a class only because it has old history.'
        : 'Warning status is validated before expiry processing.'} ${expiry}`,
    parameters: [...paging(), ...(section === 'warnings' ? [query('status', enumeration(['pending', 'appealed', 'confirmed', 'dismissed']), 'Invalid value returns 400.')] : [])],
  });
}

module.exports = { paths, schemas };
