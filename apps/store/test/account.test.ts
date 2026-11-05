import { describe, expect, it } from 'vitest';

import { accountIdSchema, findAccount, readAccountId, STORE_ACCOUNTS } from '@/accounts/accounts';
import { signValue, verifySignedValue } from '@/server/session';
import { buildIdentity } from '@/server/user';

const SECRET = 'test-only-session-secret-0123456789';
const ACCOUNT = 'store-account-0002';
const UID = '3f1c8a52-6b7d-4e0f-9a21-5c4d3b2a1f00';

describe('signed account cookie (store plan D4, Q2)', () => {
  it('verifies a value signed with the same secret', () => {
    expect(verifySignedValue(signValue(ACCOUNT, SECRET), SECRET)).toBe(ACCOUNT);
  });

  it('rejects a tampered value, a wrong secret or a missing signature', () => {
    const signed = signValue(ACCOUNT, SECRET);
    const signature = signed.slice(signed.lastIndexOf('.'));
    expect(verifySignedValue(`store-account-0001${signature}`, SECRET)).toBeUndefined();
    expect(verifySignedValue(signed, 'another-secret-0123456789')).toBeUndefined();
    expect(verifySignedValue(ACCOUNT, SECRET)).toBeUndefined();
    expect(verifySignedValue(`${ACCOUNT}.`, SECRET)).toBeUndefined();
    expect(verifySignedValue(undefined, SECRET)).toBeUndefined();
  });

  it('section 13: reads the account id of a valid cookie only', () => {
    expect(readAccountId(signValue(ACCOUNT, SECRET), SECRET)).toBe(ACCOUNT);
    expect(readAccountId(signValue('store-account-9999', SECRET), SECRET)).toBeUndefined();
    expect(readAccountId(ACCOUNT, SECRET)).toBeUndefined();
  });
});

describe('fictitious accounts', () => {
  it('has four accounts with fixed ids and no personal data fields', () => {
    expect(STORE_ACCOUNTS).toHaveLength(4);
    for (const account of STORE_ACCOUNTS) {
      expect(Object.keys(account).sort()).toEqual(['id', 'name']);
      expect(accountIdSchema.safeParse(account.id).success).toBe(true);
    }
    expect(accountIdSchema.safeParse('admin@lever.local').success).toBe(false);
    expect(findAccount(ACCOUNT)?.name).toBe('Bruno Teste');
  });

  it('section 13: login replaces the anonymous id with the account id', () => {
    const accountId = readAccountId(signValue(ACCOUNT, SECRET), SECRET);
    const identity = buildIdentity({ uid: UID, accountId, attributes: { device: 'desktop' } });
    expect(identity).toMatchObject({ source: 'account', user: { id: ACCOUNT } });
  });
});
