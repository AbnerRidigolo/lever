import { userContextSchema } from '@lever/schemas';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { COOKIES, parseJsonCookie } from '@/server/cookies';
import { buildIdentity, isValidUid, newUid } from '@/server/user';

const UID = '3f1c8a52-6b7d-4e0f-9a21-5c4d3b2a1f00';

describe('AC-8.4: user identity', () => {
  it('AC-8.4: the anonymous id identifies a user without an account', () => {
    const identity = buildIdentity({
      uid: UID,
      accountId: undefined,
      attributes: { country: 'BR', device: 'mobile' },
    });
    expect(identity.source).toBe('anonymous');
    expect(identity.user).toEqual({ id: UID, attributes: { country: 'BR', device: 'mobile' } });
    expect(userContextSchema.safeParse(identity.user).success).toBe(true);
  });

  it('section 13: the account id replaces the anonymous id after login', () => {
    const identity = buildIdentity({
      uid: UID,
      accountId: 'store-account-0001',
      attributes: { device: 'desktop' },
    });
    expect(identity.source).toBe('account');
    expect(identity.user.id).toBe('store-account-0001');
  });

  it('section 13: logging out goes back to the same anonymous id', () => {
    const before = buildIdentity({
      uid: UID,
      accountId: undefined,
      attributes: { device: 'desktop' },
    });
    const after = buildIdentity({
      uid: UID,
      accountId: undefined,
      attributes: { device: 'desktop' },
    });
    expect(after.user.id).toBe(before.user.id);
  });

  it('AC-8.4: anonymous ids are random UUIDs, and anything else is invalid', () => {
    const uid = newUid();
    expect(isValidUid(uid)).toBe(true);
    expect(newUid()).not.toBe(uid);
    expect(isValidUid('not-a-uuid')).toBe(false);
    expect(isValidUid('')).toBe(false);
    expect(isValidUid(undefined)).toBe(false);
  });
});

describe('JSON cookies', () => {
  const schema = z.object({ a: z.number() });

  it('parses a valid cookie and drops invalid ones', () => {
    expect(parseJsonCookie(schema, '{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonCookie(schema, '{"a":"x"}')).toBeUndefined();
    expect(parseJsonCookie(schema, 'not json')).toBeUndefined();
    expect(parseJsonCookie(schema, undefined)).toBeUndefined();
  });

  it('keeps the planned cookie names', () => {
    expect(COOKIES.uid).toBe('lever_uid');
  });
});
