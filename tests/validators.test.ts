import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { loadSource } from './helpers';

test('API JSON records accept nested JSON and reject non-JSON values', () => {
  const schemas = loadSource<{ identifyCustomerSchema: z.ZodType; createConversationFeedbackSchema: z.ZodType }>('src/lib/validators/index.ts', { zod: { z } });
  const json = { nested: { values: ['text', 1, null, true] } };
  for (const [schema, base, field] of [
    [schemas.identifyCustomerSchema, { externalId: 'customer-a' }, 'attributes'],
    [schemas.createConversationFeedbackSchema, { conversationId: 'conversation-a', rating: 'positive' }, 'metadata'],
  ] as const) {
    assert.equal(schema.safeParse({ ...base, [field]: json }).success, true);
    assert.equal(schema.safeParse({ ...base, [field]: { invalid: () => undefined } }).success, false);
  }
});
