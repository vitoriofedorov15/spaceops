import { OpenAPIObject, SchemaObject, ParameterObject } from '@nestjs/swagger';
const text: SchemaObject = { type: 'string' };
const id: SchemaObject = { type: 'string', format: 'uuid' };
const timestamp: SchemaObject = { type: 'string', format: 'date-time' };
const version: SchemaObject = { type: 'integer', minimum: 1 };
const object = (
  properties: Record<string, SchemaObject>,
  required: string[] = [],
): SchemaObject => ({ type: 'object', properties, required, additionalProperties: false });
const enumOf = (...values: string[]): SchemaObject => ({ type: 'string', enum: values });
/** Complete schemas for Zod-validated request bodies without coupling Nest DTO reflection to Zod. */
export function describeApi(doc: OpenAPIObject) {
  const booking = {
    space_id: id,
    title: { type: 'string', minLength: 1, maxLength: 140 } as SchemaObject,
    starts_at: timestamp,
    ends_at: timestamp,
    attendees: { type: 'integer', minimum: 1, maximum: 100 } as SchemaObject,
    requirements: { type: 'array', items: text, maxItems: 10 } as SchemaObject,
    comment: { type: 'string', maxLength: 2000 } as SchemaObject,
  };
  const schemas: Record<string, SchemaObject> = {
    'post /api/v1/bookings': object(booking, [
      'space_id',
      'title',
      'starts_at',
      'ends_at',
      'attendees',
    ]),
    'patch /api/v1/bookings/{id}': object({ ...booking, version }, [
      'space_id',
      'title',
      'starts_at',
      'ends_at',
      'attendees',
      'version',
    ]),
    'post /api/v1/bookings/{id}/cancel': object({ version }, ['version']),
    'post /api/v1/spaces/{id}/blocks': object(
      {
        starts_at: timestamp,
        ends_at: timestamp,
        reason: { type: 'string', minLength: 3, maxLength: 1000 },
      },
      ['starts_at', 'ends_at', 'reason'],
    ),
    'post /api/v1/bookings/{id}/relocation-proposals': object({ space_id: id, version }, [
      'space_id',
      'version',
    ]),
    'post /api/v1/tickets': object(
      {
        space_id: id,
        equipment_id: id,
        title: text,
        description: text,
        category: enumOf('equipment', 'climate', 'cleaning', 'other'),
        priority: enumOf('low', 'normal', 'high'),
      },
      ['space_id', 'title', 'description', 'category'],
    ),
    'patch /api/v1/tickets/{id}': object({
      status: enumOf('new', 'in_progress', 'resolved', 'closed'),
      assignee_id: { ...id, nullable: true },
      comment: text,
    }),
    'post /api/v1/tickets/{id}/comments': object(
      { body: { type: 'string', minLength: 1, maxLength: 3000 } },
      ['body'],
    ),
    'post /api/v1/equipment': object(
      {
        space_id: id,
        name: text,
        inventory_number: text,
        category: text,
        state: enumOf('working', 'broken', 'repair'),
      },
      ['space_id', 'name', 'inventory_number', 'category'],
    ),
    'patch /api/v1/equipment/{id}': object({
      name: text,
      inventory_number: text,
      category: text,
      state: enumOf('working', 'broken', 'repair'),
    }),
    'patch /api/v1/spaces/{id}': object({
      name: text,
      capacity: { type: 'integer', minimum: 1, maximum: 100 },
      archived: { type: 'boolean' },
    }),
    'post /api/v1/spaces': object(
      {
        floor_id: id,
        name: text,
        type: enumOf('room', 'desk'),
        capacity: { type: 'integer', minimum: 1, maximum: 100 },
        geometry: object(
          {
            x: { type: 'number', minimum: 0, maximum: 1000 },
            y: { type: 'number', minimum: 0, maximum: 620 },
            width: { type: 'number', minimum: 20, maximum: 1000 },
            height: { type: 'number', minimum: 20, maximum: 620 },
          },
          ['x', 'y', 'width', 'height'],
        ),
      },
      ['floor_id', 'name', 'type', 'capacity', 'geometry'],
    ),
    'patch /api/v1/users/{id}/role': object({ role: enumOf('employee', 'dispatcher', 'admin') }, [
      'role',
    ]),
  };
  const filters: Record<string, Record<string, SchemaObject>> = {
    '/api/v1/spaces': {
      floor_id: id,
      type: enumOf('room', 'desk'),
      capacity: { type: 'integer', minimum: 1 },
      search: text,
      equipment: text,
      include_archived: { type: 'boolean' },
    },
    '/api/v1/bookings': {
      mine: { type: 'boolean' },
      status: enumOf('active', 'cancelled'),
      space_id: id,
      needs_relocation: { type: 'boolean' },
    },
    '/api/v1/equipment': {
      search: text,
      state: enumOf('working', 'broken', 'repair'),
      space_id: id,
      category: text,
    },
    '/api/v1/tickets': { status: enumOf('new', 'in_progress', 'resolved', 'closed'), space_id: id },
  };
  const paged = [
    '/api/v1/spaces',
    '/api/v1/bookings',
    '/api/v1/equipment',
    '/api/v1/tickets',
    '/api/v1/notifications',
    '/api/v1/users',
    '/api/v1/blocks',
    '/api/v1/relocation-proposals',
    '/api/v1/blocks/{id}/affected-bookings',
  ];
  const ranged = [
    '/api/v1/spaces',
    '/api/v1/spaces/{id}',
    '/api/v1/floors/{id}/plan',
    '/api/v1/bookings',
    '/api/v1/analytics/overview',
  ];
  for (const [path, item] of Object.entries(doc.paths))
    for (const method of ['get', 'post', 'patch'] as const) {
      const operation = item?.[method];
      if (!operation) continue;
      const body = schemas[`${method} ${path}`];
      if (body)
        operation.requestBody = {
          required: true,
          content: { 'application/json': { schema: body } },
        };
      const query: Record<string, SchemaObject> = {
        ...(method === 'get' ? (filters[path] ?? {}) : {}),
      };
      if (method === 'get' && paged.includes(path))
        Object.assign(query, {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        });
      if (method === 'get' && ranged.includes(path))
        Object.assign(query, { from: timestamp, to: timestamp });
      operation.parameters = [
        ...(operation.parameters ?? []),
        ...Object.entries(query).map(([name, schema]): ParameterObject => ({
          in: 'query',
          name,
          required: false,
          schema,
        })),
      ];
      if (method !== 'get' && path !== '/api/v1/auth/login')
        operation.security = [{ cookie: [], csrf: [] }];
      for (const [code, description] of Object.entries({
        400: 'Invalid input or booking rule',
        401: 'Authentication required',
        403: 'Role, ownership, CSRF or Origin rejected',
        404: 'Object not found',
        409: 'Availability or version conflict',
      }))
        operation.responses[code] = {
          description,
          content: {
            'application/json': {
              schema: object(
                { code: text, message: text, details: { type: 'object', nullable: true } },
                ['code', 'message', 'details'],
              ),
            },
          },
        };
    }
  return doc;
}
