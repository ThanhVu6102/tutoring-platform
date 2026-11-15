const { ref, string, number, integer, boolean, date, array, object, enumeration, userRef, body, message, page, query, paging, operation } = require('./helpers');
const paths = {};
const add = (method, suffix, summary, schema, options) => {
  const path = `/api/classes${suffix}`;
  paths[path] = { ...paths[path], [method]: operation(method, path, 'Classes', summary, schema, options) };
};
const schedule = object({ dayOfWeek: string({ example: 'Monday' }), startTime: string({ example: '19:00' }), endTime: string({ example: '20:30' }) });
const input = {
  name: string({ maxLength: 255 }), description: string({ maxLength: 5000 }), subject: string({ maxLength: 100 }),
  grade: string({ maxLength: 100 }), capacity: number({ minimum: 1, maximum: 1000 }), schedule, thumbnail: string({ nullable: true }),
};
const core = {
  _id: ref('ObjectId'), ...input, teacher: userRef(), status: enumeration(['active', 'inactive']), createdAt: date(), updatedAt: date(),
};
const join = object({ _id: ref('ObjectId'), student: userRef(), requestedAt: date() });
const notice = object({ status: enumeration(['none', 'pending', 'appealed', 'locked', 'dismissed']), reasonCode: string(), policyLevel: number(),
  details: string(), issuedAt: date(), issuedBy: userRef(), appealDeadline: date(), appealMessage: string(), appealedAt: date({ nullable: true }), appealedBy: userRef(),
  resolvedAt: date({ nullable: true }), reviewedBy: userRef(), adminResponse: string(), reopenedAt: date(), reopenedBy: userRef(), reopenResponse: string() });
const schemas = {
  ClassApiInput: object(input),
  ClassApiCreateInput: object({ ...input, capacity: integer({ minimum: 1, maximum: 200, default: 50 }) }, ['name', 'subject']),
  ClassApiNotice: notice,
  ClassApiDetail: object({ ...core, joinCode: string(), students: array(userRef()), joinRequests: array(join),
    lockNotice: notice, lockNoticeHistory: array(notice) }),
  ClassApiListItem: object({ ...core, studentCount: integer(), joinRequestCount: integer(), lockNotice: notice, lockNoticeHistory: array(notice) }),
  ClassApiJoinRequest: join,
  ClassApiLookup: object({ _id: ref('ObjectId'), name: string(), subject: string(), grade: string(), teacher: userRef(), studentCount: integer(), capacity: number(), requestPending: boolean() }),
};
const classResult = message({ class: ref('ClassApiDetail') });
const managers = { roles: ['teacher', 'admin'] };

add('post', '', 'Create a class', classResult, { ...managers, status: 201, errors: [400, 401, 403, 409, 500, 503],
  description: 'The authenticated actor becomes teacher (including an admin creating a class). joinCode is generated. Create accepts integer capacity 1–200; update uses the schema range 1–1000.',
  requestBody: body(ref('ClassApiCreateInput'), { name: 'Example mathematics class', subject: 'Mathematics', grade: '12', capacity: 30,
    schedule: { dayOfWeek: 'Monday', startTime: '19:00', endTime: '20:30' } }),
});
add('get', '', 'List permitted classes with filters and exact totals', {
  allOf: [page(ref('ClassApiListItem')), object({ summary: object({ total: integer(), active: integer(), inactive: integer() }) })],
}, { description: 'Students see active enrolled classes; teachers see their own; admins see all. Compact items exclude students, join requests and join codes. Students get only lockNotice.status, not private appeal details/history. history/notifications views apply to managers. With admin summary=true, summary totals cover the complete filter, not this page.',
parameters: [...paging(), query('search', string({ maxLength: 200 }), 'Escaped contains search on class name.'),
  query('q', string({ maxLength: 200 }), 'Admin only: name/description contains search; takes precedence over search.'),
  query('subject', string(), 'Exact subject.'), query('grade', string(), 'Exact grade.'),
  query('status', enumeration(['active', 'inactive']), 'Managers only. Cannot expand student access.'),
  query('teacher', string(), 'Admin only: teacher ObjectId or exact normalized email.'),
  query('sort', enumeration(['newest', 'oldest', 'name_asc', 'name_desc'], { default: 'newest' }), 'Admin only; unsupported nonempty values return 400.'),
  query('summary', enumeration(['true', 'false']), 'Admin: include exact total/active/inactive summary.'),
  query('view', enumeration(['history', 'notifications']), 'Manager history includes classes with history; notifications restricts current notices to pending/appealed/locked.')],
});
add('get', '/lookup/{joinCode}', 'Look up an active class by join code', ref('ClassApiLookup'), {
  roles: ['student'], errors: [401, 403, 404, 409, 500, 503], description: 'Student only; does not enroll the caller. Already enrolled returns 409. Reports requestPending and class capacity.' });
add('post', '/join/{joinCode}/request', 'Request class admission', message({ classId: ref('ObjectId') }), {
  roles: ['student'], status: 201, errors: [401, 403, 404, 409, 500, 503], description: 'Student only; rejects already enrolled, pending duplicate, full or unavailable class. No request body is required.' });
add('get', '/join-requests/mine', 'List your pending class admission requests', array(object({
  _id: ref('ObjectId'), name: string(), subject: string(), grade: string(), teacher: userRef(), requestedAt: date(),
})), { roles: ['student'], errors: [401, 403, 500, 503], description: 'Unpaginated array of class metadata for the current student’s pending requests.' });
add('get', '/{id}/join-requests', 'List a class’s admission requests', array(ref('ClassApiJoinRequest')), {
  ...managers, description: 'Responsible teacher or admin. Student profiles are populated; student email is available only to an admin, not to the teacher.' });
add('patch', '/{id}/join-requests/{studentId}', 'Approve or reject a pending admission request', ref('Message'), {
  ...managers, errors: [400, 401, 403, 404, 409, 423, 500, 503], description: 'Responsible teacher/admin; approve checks active class, capacity and active student. reject removes the pending request. The body cannot change the actor.',
  requestBody: body(object({ action: enumeration(['approve', 'reject']) }, ['action']), { action: 'approve' }),
});
add('get', '/{id}/content-summary', 'Count learning resources without loading their lists', object({ videos: integer(), documents: integer(), quizzes: integer(), assignments: integer() }), {
  description: 'Requires class access matching the current role. Student quiz count includes only published quizzes. Does not include announcement count.' });
add('get', '/{id}', 'Read class details', ref('ClassApiDetail'), {
  description: 'Admin, responsible teacher, or enrolled student. Students cannot access inactive classes and do not receive joinCode/joinRequests or private lock-appeal data. Teacher/student profiles are filtered per viewer. A legacy class missing its code may generate one on a manager read.' });
add('put', '/{id}', 'Update class metadata', classResult, { ...managers,
  description: 'Responsible teacher/admin; inactive classes cannot be updated. Only the documented safe metadata is assigned; teacher/roster/status cannot be changed here. Capacity schema allows numbers 1–1000 (create is stricter).',
  requestBody: body(ref('ClassApiInput'), { name: 'Updated mathematics class', capacity: 35 }),
});
add('delete', '/{id}', 'Archive a class while preserving history', ref('Message'), { ...managers,
  description: 'Responsible teacher/admin; sets status=inactive rather than deleting records. Already inactive returns 423. Session and attendance references remain intact.' });
add('post', '/{id}/enroll', 'Enroll an existing active student by email', ref('Message'), { ...managers,
  errors: [400, 401, 403, 404, 409, 423, 500, 503], description: 'Responsible teacher/admin; requires active class and student. Atomic capacity check; duplicate, full or competing enrollment is rejected. Updates the student’s enrolledClasses and writes audit history.',
  requestBody: body(object({ studentEmail: string({ format: 'email' }) }, ['studentEmail']), { studentEmail: 'student@example.test' }),
});
add('get', '/{id}/students', 'Read the class roster', array({ anyOf: [ref('PublicUser'), ref('PrivateUser')] }), { ...managers,
  description: 'Responsible teacher/admin only, not students. Teacher receives public student fields; admin receives the private allowlist. Unpaginated array.' });
add('patch', '/{id}/lock-notice', 'Issue a class-lock notice', classResult, { roles: ['admin'], status: 202,
  errors: [400, 401, 403, 404, 409, 500, 503], description: 'Starts the teacher’s 24-hour appeal period. Actor/timestamps are server-generated; competing/invalid state returns 409.',
  requestBody: body(ref('NoticeInput'), { reasonCode: 'other', policyLevel: 1, details: 'Please review this class policy incident.' }),
});
add('post', '/{id}/lock-appeal', 'Appeal a class-lock notice', ref('Message'), { roles: ['teacher'],
  errors: [400, 401, 403, 404, 409, 500, 503], description: 'Only the responsible teacher can appeal a pending eligible notice before its 24-hour deadline; admins cannot submit a teacher appeal.',
  requestBody: body(ref('AppealInput'), { message: 'I request a review of this class notice.' }),
});
add('patch', '/{id}/lock-review', 'Decide a class-lock notice', classResult, { roles: ['admin'],
  errors: [400, 401, 403, 404, 409, 500, 503], description: 'Records lock/dismiss decision, reviewer and response. A pending notice cannot be reviewed before its appeal deadline; an appealed notice may be reviewed earlier. Atomic revision checks reject stale concurrent reviews.',
  requestBody: body(object({ decision: enumeration(['lock', 'dismiss']), response: string({ maxLength: 2000 }) }, ['decision']), { decision: 'dismiss', response: 'Reviewed and dismissed.' }),
});
add('patch', '/{id}/status', 'Reopen a previously locked class', classResult, { roles: ['admin'],
  errors: [400, 401, 403, 404, 409, 500, 503], description: 'Only status=active is supported. Locks require the notice/review workflow, not a direct status change. Reopening retains the original lock decision in history.',
  requestBody: body(object({ status: enumeration(['active']) }, ['status']), { status: 'active' }),
});

module.exports = { paths, schemas };
