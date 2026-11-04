import type { FlagValue } from '@lever/schemas';
import { describe, expect, it } from 'vitest';

import type { EvaluationKind, EvaluationObserver, LeverAdapter } from '@/lever/adapter';
import { withSafety } from '@/lever/decorate';
import { logExposure } from '@/lever/exposure';
import { resolveCheckoutLayout } from '@/lever/keys';

import { USER, captureLogger } from './helpers';

function recordingObserver() {
  const evaluated: [EvaluationKind, string][] = [];
  const failed: EvaluationKind[] = [];
  const observer: EvaluationObserver = {
    evaluated: (kind, key) => evaluated.push([kind, key]),
    failed: (kind) => failed.push(kind),
  };
  return { observer, evaluated, failed };
}

function fakeAdapter(answers: { flag?: () => FlagValue; variant?: () => string }): LeverAdapter {
  return {
    getFlag: <T extends FlagValue>(_key: string, _user: unknown, defaultValue: T) =>
      Promise.resolve((answers.flag?.() ?? defaultValue) as T),
    getVariant: (_key, _user, fallback) => Promise.resolve(answers.variant?.() ?? fallback),
    configAgeSeconds: () => {
      throw new Error('boom');
    },
  };
}

const notImplemented = () => {
  throw new Error('not implemented: reserved for author');
};

describe('withSafety: Lever never breaks a page (store plan, section 4)', () => {
  it('AC-8.5: an exception in flag evaluation becomes the default and is counted', async () => {
    const { logger, lines } = captureLogger();
    const { observer, evaluated, failed } = recordingObserver();
    const lever = withSafety(fakeAdapter({ flag: notImplemented }), { logger, observer });

    expect(await lever.getFlag('new-banner', USER, false)).toBe(false);
    expect(evaluated).toEqual([['flag', 'new-banner']]);
    expect(failed).toEqual(['flag']);
    expect(lines[0]).toMatchObject({ level: 50, flagKey: 'new-banner' });
    expect(JSON.stringify(lines)).not.toContain(USER.id);
  });

  it('AC-8.5: an exception in variant evaluation becomes the fallback and is counted', async () => {
    const { logger } = captureLogger();
    const { observer, failed } = recordingObserver();
    const lever = withSafety(fakeAdapter({ variant: notImplemented }), { logger, observer });

    expect(await lever.getVariant('checkout-layout', USER, 'one-page')).toBe('one-page');
    expect(failed).toEqual(['variant']);
  });

  it('a flag value of the wrong type becomes the default', async () => {
    const { logger, lines } = captureLogger();
    const { observer, failed } = recordingObserver();
    const lever = withSafety(fakeAdapter({ flag: () => 'true' }), { logger, observer });

    expect(await lever.getFlag('new-banner', USER, false)).toBe(false);
    expect(failed).toEqual([]);
    expect(lines[0]).toMatchObject({ level: 40 });
  });

  it('an invalid variant key becomes the fallback', async () => {
    const { logger } = captureLogger();
    const { observer } = recordingObserver();
    const lever = withSafety(fakeAdapter({ variant: () => '' }), { logger, observer });
    expect(await lever.getVariant('checkout-layout', USER, 'one-page')).toBe('one-page');
  });

  it('passes valid answers through and counts them', async () => {
    const { logger } = captureLogger();
    const { observer, evaluated } = recordingObserver();
    const lever = withSafety(fakeAdapter({ flag: () => true, variant: () => 'multi-step' }), {
      logger,
      observer,
    });
    expect(await lever.getFlag('new-banner', USER, false)).toBe(true);
    expect(await lever.getVariant('checkout-layout', USER, 'one-page')).toBe('multi-step');
    expect(evaluated).toEqual([
      ['flag', 'new-banner'],
      ['variant', 'checkout-layout'],
    ]);
  });

  it('a failing configuration age reads as unknown', () => {
    const { logger } = captureLogger();
    const lever = withSafety(fakeAdapter({}), { logger, observer: recordingObserver().observer });
    expect(lever.configAgeSeconds()).toBeNull();
  });
});

describe('AC-8.3: checkout layout of a variant', () => {
  it('AC-8.3: known variants map to their layout', () => {
    const { logger } = captureLogger();
    expect(resolveCheckoutLayout('one-page', logger)).toBe('one-page');
    expect(resolveCheckoutLayout('multi-step', logger)).toBe('multi-step');
  });

  it('an unknown variant renders the control and logs a warning', () => {
    const { logger, lines } = captureLogger();
    expect(resolveCheckoutLayout('express', logger)).toBe('one-page');
    expect(lines[0]).toMatchObject({ level: 40, variantKey: 'express' });
  });
});

describe('AC-5.7: exposure log', () => {
  it('AC-5.7: logs the exposure without the user id', () => {
    const { logger, lines } = captureLogger();
    logExposure(logger, {
      type: 'exposure',
      experimentKey: 'checkout-layout',
      variantKey: 'multi-step',
      userId: USER.id,
      configVersion: 7,
      timestamp: '2026-11-03T12:00:00.000Z',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 30,
      msg: 'exposure',
      experimentKey: 'checkout-layout',
      variantKey: 'multi-step',
      configVersion: 7,
    });
    expect(JSON.stringify(lines[0])).not.toContain(USER.id);
  });

  it('drops an invalid exposure event', () => {
    const { logger, lines } = captureLogger();
    logExposure(logger, {
      type: 'exposure',
      experimentKey: 'checkout-layout',
      variantKey: 'multi-step',
      userId: USER.id,
      configVersion: 0,
      timestamp: 'yesterday',
    });
    expect(lines[0]).toMatchObject({ level: 40, msg: 'invalid exposure event dropped' });
  });
});
