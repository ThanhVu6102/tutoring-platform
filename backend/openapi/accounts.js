const { ref, string, integer, boolean, date, array, object, enumeration, userRef, json, body, message, page, query, paging, operation } = require('./helpers');
const paths = {};
const add = (method, path, summary, schema, options) => {
  paths[path] = { ...paths[path], [method]: operation(method, path,
    path.startsWith('/api/auth') ? 'Authentication' : 'Users', summary, schema, options) };
};
const roles = ['student', 'teacher', 'admin'];
const authUser = object({ id: ref('ObjectId'), name: string(), email: string({ format: 'email' }), role: enumeration(roles) }, ['id', 'name', 'email', 'role']);
const authResult = message({ token: string({ example: '<JWT returned by successful sign-in>', description: 'HS256 JWT, expires after 7 days. Copy this into Authorize; do not share or commit it.' }), user: authUser });
const userResult = message({ user: object({ ...authUser.properties, status: enumeration(['pending', 'active', 'inactive', 'left', 'rejected']) }) });
const password = string({ format: 'password', writeOnly: true, minLength: 8,
  description: 'At least 8 JavaScript string code units and at most 72 UTF-8 bytes. No whitespace trimming.' });
const schemas = {
  AccountRegister: object({ name: string({ minLength: 1, maxLength: 200 }), email: string({ format: 'email', maxLength: 255 }),
    password, role: enumeration(['student', 'teacher'], { default: 'student', description: 'Omitted or unsupported values are treated as student; public admin registration is not supported.' }),
    acceptedPolicies: boolean({ enum: [true] }) }, ['name', 'email', 'password', 'acceptedPolicies']),
  AccountLogin: object({ email: string({ format: 'email' }), password: string({ format: 'password', writeOnly: true }) }, ['email', 'password']),
  AccountAuthResult: authResult,
  AccountProfileInput: object({ name: string({ maxLength: 200 }), avatar: string({ nullable: true,
    maxLength: 3000000, description: 'HTTP(S) URL, empty/null to remove, or PNG/JPEG/WebP data URL (maximum 3,000,000 encoded characters).' }), bio: string({ maxLength: 2000 }), phone: string({ maxLength: 30 }) }),
  AccountAuditLog: object({ _id: ref('ObjectId'), actorId: userRef(), action: string(), oldData: { type: 'object', additionalProperties: true },
    newData: { type: 'object', additionalProperties: true }, createdAt: date() }),
};
add('post', '/api/auth/register', 'Register a student or pending teacher', ref('AccountAuthResult'), {
  public: true, status: 201, errors: [400, 409, 500, 503], description: 'Accept the current policies to register. Students receive a token (201). Teachers await administrator approval (202, no token). Email is normalized to lowercase. Reserved administrator identity cannot be registered.',
  requestBody: body(ref('AccountRegister'), { name: 'Example Student', email: 'student@example.test', password: 'Example-only-123!', role: 'student', acceptedPolicies: true }),
  responses: { 202: json(message({ user: object({ ...authUser.properties, status: enumeration(['pending']) }) }), 'Teacher application accepted; user.status=pending. No token is returned.') },
});
add('post', '/api/auth/login', 'Sign in with email and password', ref('AccountAuthResult'), {
  public: true, errors: [400, 401, 403, 423, 500, 503], description: 'All roles use the stored password hash. Pending, rejected, inactive, blocked, suspended, banned, and deleted accounts cannot sign in. There is no server logout endpoint; removing a token from the client does not revoke it.',
  requestBody: body(ref('AccountLogin'), { email: 'student@example.test', password: 'Example-only-123!' }),
});
add('get', '/api/users/profile', 'Read your personal profile', ref('PrivateUser'), { description: 'Current user only; enrolledClasses is populated with class name, subject, and grade. No password or internal revisions.' });
add('put', '/api/users/profile', 'Update your personal profile', message({ user: object({ ...authUser.properties, avatar: string({ nullable: true }), bio: string(), phone: string() }) }), {
  description: 'Only name, avatar, bio, phone are writable. Empty bio/phone/name are ignored by the current route; avatar can be cleared. Email, role and password cannot be changed here.',
  requestBody: body(ref('AccountProfileInput'), { name: 'Updated Name', phone: '0900000000', bio: 'Learning with Eklasses', avatar: '' }),
});
add('patch', '/api/users/password', 'Change your own password', ref('Message'), {
  errors: [400, 401, 403, 409, 500, 503], description: 'Requires the current password. New password must differ from the old one. A competing change returns 409. Existing JWT sessions remain valid until expiry or account restriction.',
  requestBody: body(object({ currentPassword: string({ format: 'password', writeOnly: true }), newPassword: password }, ['currentPassword', 'newPassword']),
    { currentPassword: 'Example-old-123!', newPassword: 'Example-new-456!' }),
});
add('get', '/api/users/{id}', 'Read a user profile with viewer-based privacy', { anyOf: [ref('PublicUser'), ref('PrivateUser')] }, {
  description: 'Any authenticated user can view the public allowlist. Only self/admin receives private fields. Query parameters cannot impersonate another viewer or request private fields.',
});
add('get', '/api/users', 'List and filter accounts (administrator)', page(ref('PrivateUser')), {
  roles: ['admin'], description: 'Excludes soft-deleted users. Invalid role/status filters are ignored. search is escaped case-insensitive name/email matching. view=moderation omits heavy profile/avatar fields.',
  parameters: [...paging(), query('search', string(), 'Name or email contains search.'), query('role', enumeration(roles), 'Optional role filter.'),
    query('status', enumeration(['pending', 'active', 'inactive', 'left', 'rejected']), 'Optional account state.'), query('view', enumeration(['moderation']), 'Compact moderation projection.')],
});
for (const action of ['approve', 'reject']) {
  add('put', `/api/users/{id}/${action}`, `${action === 'approve' ? 'Approve' : 'Reject'} a pending teacher`, userResult, {
    roles: ['admin'], errors: [400, 401, 403, 409, 500, 503], description: 'Atomic pending-teacher-only review; already processed or ineligible targets return 409. Records reviewer and an audit entry.',
    ...(action === 'reject' ? { requestBody: body(object({ note: string({ maxLength: 2000 }) }), { note: 'Please provide additional information.' }, false) } : {}),
  });
}
for (const action of ['block', 'unblock']) {
  add('put', `/api/users/{id}/${action}`, `${action === 'block' ? 'Block' : 'Unblock'} an account`, message({ user: object({ id: ref('ObjectId'), name: string(), isBlocked: boolean() }) }), {
    roles: ['admin'], description: action === 'block' ? 'Cannot block yourself or the protected root administrator. Does not change lifecycle status.' : 'Clears isBlocked only; does not reset status, password, suspension or ban.',
  });
}
add('put', '/api/users/{id}/role', 'Change an account role', userResult, { roles: ['admin'],
  description: 'Protected root administrator role cannot be changed. Later requests use the new database role rather than stale token claims.',
  requestBody: body(object({ role: enumeration(roles) }, ['role']), { role: 'teacher' }),
});
add('delete', '/api/users/{id}', 'Soft-delete an account', ref('Message'), { roles: ['admin'],
  description: 'Sets deletedAt and retains history. Cannot delete yourself or the protected root administrator.' });
add('get', '/api/users/{id}/audit-logs', 'Read the latest account audit records', array(ref('AccountAuditLog')), { roles: ['admin'],
  description: 'At most 100 audit records for targetType=user, newest first. Not a paginated response; actor is an ID unless populated.' });

module.exports = { paths, schemas };
