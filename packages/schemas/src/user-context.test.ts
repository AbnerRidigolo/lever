import { describe, expect, it } from 'vitest';

import { userContextSchema } from './user-context.js';

describe('userContextSchema', () => {
  it('accepts string, number, boolean and string[] attributes', () => {
    const user = {
      id: 'anon-7f3a',
      attributes: { country: 'BR', age: 31, beta: true, device: ['mobile'] },
    };
    expect(userContextSchema.parse(user)).toEqual(user);
  });

  it('accepts a user without attributes', () => {
    expect(userContextSchema.safeParse({ id: 'anon-1', attributes: {} }).success).toBe(true);
  });

  it('rejects an empty id', () => {
    expect(userContextSchema.safeParse({ id: '', attributes: {} }).success).toBe(false);
  });

  it.each([{ nested: { a: 1 } }, { list: [1, 2] }, { empty: null }])(
    'rejects unsupported attribute values: %j',
    (attributes) => {
      expect(userContextSchema.safeParse({ id: 'anon-1', attributes }).success).toBe(false);
    },
  );
});
