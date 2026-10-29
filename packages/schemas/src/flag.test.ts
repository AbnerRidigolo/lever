import { describe, expect, it } from 'vitest';

import {
  FLAG_TYPES,
  flagConfigSchema,
  flagDefinitionSchema,
  flagEnvironmentSettingsSchemaFor,
  flagValueSchemaFor,
} from './flag.js';

const validValues = {
  boolean: [true, false],
  string: ['', 'blue', 'a'.repeat(10_000)],
  number: [0, -1, 3.14, 1e9],
  json: [{ title: 'Black Friday', items: [1, 2] }, [1, 'a'], null, 'text', 42],
} as const;

const invalidValues = {
  boolean: ['true', 1, null, {}],
  string: [1, true, null, { a: 1 }, 'a'.repeat(10_001)],
  number: ['1', true, null, Number.NaN, Number.POSITIVE_INFINITY],
  json: [undefined, () => 1, new Date(0), Number.NaN],
} as const;

describe('flag values', () => {
  it.each(FLAG_TYPES)('AC-1.4 (contract): accepts valid %s values', (type) => {
    for (const value of validValues[type]) {
      expect(flagValueSchemaFor(type).safeParse(value).success).toBe(true);
    }
  });

  it.each(FLAG_TYPES)('AC-1.4 (contract): rejects values that do not match type %s', (type) => {
    for (const value of invalidValues[type]) {
      expect(flagValueSchemaFor(type).safeParse(value).success).toBe(false);
    }
  });
});

describe('flagDefinitionSchema', () => {
  it('AC-1.4 (contract): accepts a boolean flag with a boolean default', () => {
    const result = flagDefinitionSchema.parse({
      key: 'new-banner',
      type: 'boolean',
      defaultValue: false,
    });
    expect(result).toEqual({ key: 'new-banner', type: 'boolean', defaultValue: false });
  });

  it('AC-1.4 (contract): rejects a default value that does not match the type', () => {
    expect(
      flagDefinitionSchema.safeParse({ key: 'new-banner', type: 'boolean', defaultValue: 'off' })
        .success,
    ).toBe(false);
    expect(
      flagDefinitionSchema.safeParse({ key: 'max-items', type: 'number', defaultValue: '10' })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown flag type', () => {
    expect(
      flagDefinitionSchema.safeParse({ key: 'x', type: 'date', defaultValue: '2026-01-01' })
        .success,
    ).toBe(false);
  });

  it.each(['New-Banner', 'new_banner', 'new banner', '-new', 'new-', 'new--banner', ''])(
    'FR-002: rejects the invalid key %j',
    (key) => {
      expect(
        flagDefinitionSchema.safeParse({ key, type: 'boolean', defaultValue: false }).success,
      ).toBe(false);
    },
  );
});

describe('flagEnvironmentSettingsSchemaFor', () => {
  it('FR-002: accepts per-environment state, served value, rollout and segment', () => {
    const schema = flagEnvironmentSettingsSchemaFor('string');
    expect(
      schema.safeParse({
        enabled: true,
        servedValue: 'blue',
        rolloutBps: 1_000,
        segmentKey: 'br-mobile',
      }).success,
    ).toBe(true);
  });

  it('AC-1.4 (contract): rejects a served value of another type', () => {
    const schema = flagEnvironmentSettingsSchemaFor('number');
    expect(
      schema.safeParse({ enabled: true, servedValue: 'ten', rolloutBps: 0, segmentKey: null })
        .success,
    ).toBe(false);
  });

  it.each([-1, 10_001, 10.5])('FR-002: rejects rollout of %d bps', (rolloutBps) => {
    const schema = flagEnvironmentSettingsSchemaFor('boolean');
    expect(
      schema.safeParse({ enabled: true, servedValue: true, rolloutBps, segmentKey: null }).success,
    ).toBe(false);
  });
});

describe('flagConfigSchema', () => {
  const base = {
    key: 'new-banner',
    type: 'boolean',
    salt: 'salt-0001',
    defaultValue: false,
    enabled: true,
    servedValue: true,
    rolloutBps: 10_000,
    segmentKey: null,
  };

  it('accepts a complete flag configuration', () => {
    expect(flagConfigSchema.safeParse(base).success).toBe(true);
  });

  it('AC-1.4 (contract): requires default and served values of the flag type', () => {
    expect(flagConfigSchema.safeParse({ ...base, servedValue: 'yes' }).success).toBe(false);
    expect(flagConfigSchema.safeParse({ ...base, defaultValue: 0 }).success).toBe(false);
  });

  it('requires a salt', () => {
    const { salt: _salt, ...withoutSalt } = base;
    expect(flagConfigSchema.safeParse(withoutSalt).success).toBe(false);
  });
});
