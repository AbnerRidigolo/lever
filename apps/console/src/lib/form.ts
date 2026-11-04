import type { FlagType, SegmentCondition } from '@lever/schemas';

/** Text of a form field; an absent field is an empty string. */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** The screen uses percentages and the database basis points. Invalid input stays invalid (NaN). */
export function percentToBps(percent: string): number {
  return percent.trim() === '' ? Number.NaN : Math.round(Number(percent) * 100);
}

export function bpsToPercent(bps: number): string {
  return String(bps / 100);
}

/**
 * Turns the text of a value field into the JSON value of the flag type. Anything unparsable is
 * returned as is, so the Zod schema of the type rejects it with a proper message (AC-1.4).
 */
export function parseFlagValue(type: FlagType, raw: string): unknown {
  switch (type) {
    case 'boolean':
      return raw === 'true' ? true : raw === 'false' ? false : raw;
    case 'number':
      return raw.trim() === '' ? raw : Number(raw);
    case 'string':
      return raw;
    case 'json':
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
  }
}

export function formatFlagValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Value of a `equals` or `in` rule: numbers and booleans are typed, the rest is text. */
function parseScalar(raw: string): string | number | boolean {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value;
}

/** Turns the text of a rule value into the shape its operator requires (AC-4.2). */
export function parseRuleValue(operator: SegmentCondition['operator'], raw: string): unknown {
  switch (operator) {
    case 'in':
    case 'not_in':
      return raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
        .map((item) => {
          const scalar = parseScalar(item);
          return typeof scalar === 'boolean' ? item : scalar;
        });
    case 'greater_than':
    case 'less_than':
      return raw.trim() === '' ? raw : Number(raw);
    case 'equals':
    case 'not_equals':
      return parseScalar(raw);
    case 'contains':
      return raw;
  }
}

export function formatRuleValue(value: SegmentCondition['value']): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}
