// Builder thuần cho OpenAPI; nạp tài liệu không được kết nối MongoDB.
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const string = (options = {}) => ({ type: 'string', ...options });
const number = (options = {}) => ({ type: 'number', ...options });
const integer = (options = {}) => ({ type: 'integer', ...options });
const boolean = (options = {}) => ({ type: 'boolean', ...options });
const date = (options = {}) => string({ format: 'date-time', ...options });
const array = (items) => ({ type: 'array', items });
const object = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const enumeration = (values, options = {}) => string({ enum: values, ...options });
const userRef = () => ({ anyOf: [ref('ObjectId'), ref('PublicUser'), ref('PrivateUser')], nullable: true,
  description: 'ObjectId when not populated; otherwise fields are filtered for the viewer (private fields only for self/admin).' });
const json = (schema, description = 'Success', example) => ({ description,
  content: { 'application/json': { schema, ...(example === undefined ? {} : { example }) } } });
const body = (schema, example, required = true) => ({ required,
  content: { 'application/json': { schema, ...(example === undefined ? {} : { example }) } } });
const message = (properties = {}) => object({ message: string({ example: 'Thao tác thành công' }), ...properties }, ['message']);
const page = (items) => ({ allOf: [ref('PaginationMeta'), object({ data: array(items) }, ['data'])] });
const query = (name, schema, description) => ({ name, in: 'query', required: false, schema, description });
const paging = () => [
  query('page', integer({ minimum: 1, default: 1 }), 'Positive decimal integer; values above 10000 are capped at 10000.'),
  query('limit', integer({ minimum: 1, default: 20 }), 'Positive decimal integer; values above 100 are capped at 100. Invalid syntax returns 400.'),
];
const errorDescriptions = {
  400: 'Invalid input, malformed JSON, invalid ID or pagination; check the message.',
  401: 'Missing, invalid, expired token or unavailable/deleted account.',
  403: 'Current database account/role or resource relationship does not allow this operation.',
  404: 'Resource not found or deliberately hidden from this viewer.',
  409: 'Duplicate, stale or incompatible workflow state; refresh before retrying.',
  413: 'Request exceeds the parser body-size limit (JSON: 7 MB).',
  423: 'Account suspended or class/resource locked.',
  500: 'Unexpected error or database connection unavailable; some legacy handlers return route-specific messages.',
  503: 'JWT configuration unavailable or the operation requires MongoDB transaction support (replica set/Atlas).',
};

function operation(method, path, tag, summary, schema, options = {}) {
  const { description = summary, roles = ['student', 'teacher', 'admin'], status = 200,
    errors = [400, 401, 403, 404, 423, 500, 503], parameters = [], requestBody,
    public: isPublic = false, responses = {}, ...extra } = options;
  const params = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({ name, in: 'path', required: true,
    schema: name === 'joinCode' ? string({ example: 'ABCD2345' }) : ref('ObjectId'),
    description: name === 'joinCode' ? 'Class code; hyphens are removed and letters normalized to uppercase.' : `${name}: MongoDB ObjectId.` }));
  const result = {
    tags: [tag], summary, description,
    operationId: method + path.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(''),
    'x-roles': isPublic ? [] : roles, security: isPublic ? [] : [{ bearerAuth: [] }],
    ...(params.length || parameters.length ? { parameters: [...params, ...parameters] } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: { [status]: json(schema), ...Object.fromEntries(errors.map((code) => [code,
      json(ref('Error'), errorDescriptions[code], { message: errorDescriptions[code] })])), ...responses },
    ...extra,
  };
  // Lỗi parser có thể xảy ra trước cả xác thực khi gửi body JSON.
  if (requestBody) result.responses[413] = json(ref('Error'), errorDescriptions[413], { message: 'Dữ liệu gửi lên quá lớn' });
  return result;
}

module.exports = { ref, string, number, integer, boolean, date, array, object, enumeration,
  userRef, json, body, message, page, query, paging, operation };
