const { ref, string, integer, boolean, date, array, object, enumeration, userRef } = require('./helpers');

const schemas = {
  ObjectId: string({ pattern: '^[a-fA-F0-9]{24}$', example: '507f1f77bcf86cd799439011', description: '24 hexadecimal characters.' }),
  Error: object({ message: string(), suspendedUntil: date(), restriction: object({ className: string(), reasonCode: string(), details: string(), sanction: string() }) }, ['message']),
  Message: object({ message: string({ example: 'Thao tác thành công' }) }, ['message']),
  PaginationMeta: object({ page: integer({ minimum: 1, example: 1 }), limit: integer({ minimum: 1, maximum: 100, example: 20 }),
    total: integer({ minimum: 0, example: 1 }), totalPages: integer({ minimum: 0, example: 1 }) }, ['page', 'limit', 'total', 'totalPages']),
  PublicUser: object({ _id: ref('ObjectId'), id: ref('ObjectId'), name: string({ example: 'Example Student' }),
    role: enumeration(['student', 'teacher', 'admin']), avatar: string({ nullable: true }), bio: string() }),
  PrivateUser: { allOf: [ref('PublicUser'), object({ email: string({ example: 'student@example.test' }), phone: string(),
    status: enumeration(['pending', 'active', 'inactive', 'left', 'rejected']), isBlocked: boolean(),
    policiesAcceptedAt: date(), policyVersion: string(), disciplinarySanctions: integer(), classRemovalIncidents: integer(),
    suspendedUntil: date({ nullable: true }), permanentlyBanned: boolean(), deletedAt: date({ nullable: true }),
    enrolledClasses: array({ anyOf: [ref('ObjectId'), object({ _id: ref('ObjectId'), name: string(), subject: string(), grade: string() })] }),
    review: object({ reviewedBy: userRef(), reviewedAt: date(), note: string() }), createdAt: date(), updatedAt: date(), __v: integer() })],
    description: 'Self/admin allowlist; optional fields depend on the database projection. Password and internal revisions are never returned.' },
  NoticeInput: object({ reasonCode: enumeration(['spam', 'abusive_content', 'copyright', 'account_sharing', 'academic_fraud',
    'illegal_content', 'privacy_breach', 'financial_misconduct', 'class_disruption', 'other']),
  policyLevel: { oneOf: [integer({ enum: [1, 2, 3] }), enumeration(['1', '2', '3'])] },
  details: string({ minLength: 1, maxLength: 2000, example: 'Please review the described policy incident.' }) }, ['reasonCode', 'policyLevel', 'details']),
  AppealInput: object({ message: string({ minLength: 1, maxLength: 3000, example: 'I request a review of this incident.' }) }, ['message']),
};

module.exports = schemas;
