import { describe, expect, it } from 'vitest';

import {
  auditFilterSchema,
  createApiKeySchema,
  createProjectSchema,
  experimentTransitionSchema,
  memberInputSchema,
} from './console.js';

describe('console input schemas', () => {
  it('FR-001: requires a project name and a kebab-case slug', () => {
    expect(createProjectSchema.safeParse({ name: 'Demo', slug: 'demo' }).success).toBe(true);
    expect(createProjectSchema.safeParse({ name: ' ', slug: 'demo' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: 'Demo', slug: 'Not Valid' }).success).toBe(false);
  });

  it('AC-7.2 (contract): normalizes member emails and only accepts the three roles', () => {
    expect(memberInputSchema.parse({ email: 'Ana@Example.COM', role: 'viewer' }).email).toBe(
      'ana@example.com',
    );
    expect(memberInputSchema.safeParse({ email: 'nope', role: 'viewer' }).success).toBe(false);
    expect(memberInputSchema.safeParse({ email: 'a@b.co', role: 'owner' }).success).toBe(false);
  });

  it('AC-7.3 (contract): an API key needs an environment and a name', () => {
    expect(createApiKeySchema.safeParse({ environment: 'production', name: 'loja' }).success).toBe(
      true,
    );
    expect(createApiKeySchema.safeParse({ environment: 'staging', name: 'loja' }).success).toBe(
      false,
    );
  });

  it('AC-3.5 (contract): a transition targets an environment and a known status', () => {
    expect(
      experimentTransitionSchema.safeParse({ environment: 'development', to: 'running' }).success,
    ).toBe(true);
    expect(
      experimentTransitionSchema.safeParse({ environment: 'development', to: 'stopped' }).success,
    ).toBe(false);
  });

  it('AC-6.2 (contract): filters by resource, author and period, starting at page 1', () => {
    const filter = auditFilterSchema.parse({ resourceType: 'flag', from: '2026-10-01' });
    expect(filter.page).toBe(1);
    expect(filter.from).toBeInstanceOf(Date);
    expect(auditFilterSchema.safeParse({ resourceType: 'project' }).success).toBe(false);
  });
});
