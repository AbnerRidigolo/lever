'use client';

import {
  SEGMENT_OPERATORS,
  type SegmentCondition,
  type SegmentOperator,
  type SegmentRules,
} from '@lever/schemas';
import { useState } from 'react';

import { formatRuleValue, parseRuleValue } from '@/lib/form';

import { Button, Input, Select } from './ui';

interface Row {
  id: number;
  attribute: string;
  operator: SegmentOperator;
  value: string;
}

const OPERATOR_LABELS: Record<SegmentOperator, string> = {
  equals: 'igual a',
  not_equals: 'diferente de',
  in: 'em (lista)',
  not_in: 'fora de (lista)',
  greater_than: 'maior que',
  less_than: 'menor que',
  contains: 'contém',
};

function rowsOf(rules: SegmentRules | undefined): Row[] {
  const conditions: SegmentCondition[] = rules?.conditions ?? [];
  if (conditions.length === 0) return [{ id: 0, attribute: '', operator: 'equals', value: '' }];
  return conditions.map((condition, id) => ({
    id,
    attribute: condition.attribute,
    operator: condition.operator,
    value: formatRuleValue(condition.value),
  }));
}

/** Editor of segment conditions, combined with AND. Sends them as JSON in the `rules` field. */
export function RulesEditor({ initial }: { initial?: SegmentRules }) {
  const [rows, setRows] = useState<Row[]>(() => rowsOf(initial));
  const update = (id: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const rules = {
    conditions: rows.map((row) => ({
      attribute: row.attribute.trim(),
      operator: row.operator,
      value: parseRuleValue(row.operator, row.value),
    })),
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Regras (todas precisam valer)</legend>
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />
      {rows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <Input
            aria-label={`Atributo ${index + 1}`}
            placeholder="country"
            value={row.attribute}
            onChange={(event) => {
              update(row.id, { attribute: event.target.value });
            }}
          />
          <Select
            aria-label={`Operador ${index + 1}`}
            value={row.operator}
            onChange={(event) => {
              update(row.id, { operator: event.target.value as SegmentOperator });
            }}
          >
            {SEGMENT_OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {OPERATOR_LABELS[operator]}
              </option>
            ))}
          </Select>
          <Input
            aria-label={`Valor ${index + 1}`}
            placeholder="BR"
            value={row.value}
            onChange={(event) => {
              update(row.id, { value: event.target.value });
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length === 1}
            onClick={() => {
              setRows((current) => current.filter((item) => item.id !== row.id));
            }}
          >
            Remover
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setRows((current) => [
              ...current,
              {
                id: Math.max(...current.map((item) => item.id)) + 1,
                attribute: '',
                operator: 'equals',
                value: '',
              },
            ]);
          }}
        >
          Adicionar regra
        </Button>
      </div>
    </fieldset>
  );
}
