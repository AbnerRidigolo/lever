'use client';

import { MAX_VARIANTS, MIN_VARIANTS, type ExperimentVariant } from '@lever/schemas';
import { useState } from 'react';

import { bpsToPercent, percentToBps } from '@/lib/form';

import { Button, Input } from './ui';

interface Row {
  id: number;
  key: string;
  percent: string;
}

const DEFAULT_ROWS: Row[] = [
  { id: 0, key: 'control', percent: '50' },
  { id: 1, key: 'treatment', percent: '50' },
];

/**
 * Editor of 2 to 5 variants with weights in percent (AC-3.1). The first row is the control.
 * Sends them as JSON in the `variants` field.
 */
export function VariantsEditor({
  initial,
  disabled = false,
}: {
  initial?: ExperimentVariant[];
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(
    () =>
      initial?.map((variant, id) => ({
        id,
        key: variant.key,
        percent: bpsToPercent(variant.weightBps),
      })) ?? DEFAULT_ROWS,
  );
  const update = (id: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const variants = rows.map((row, index) => ({
    key: row.key.trim(),
    weightBps: percentToBps(row.percent),
    isControl: index === 0,
  }));
  const total = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);

  return (
    <>
      {/* Outside the fieldset: a disabled fieldset would not submit it. */}
      <input type="hidden" name="variants" value={JSON.stringify(variants)} />
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 text-sm font-medium">Variantes (a primeira é o controle)</legend>
        {rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[1fr_6rem_auto] gap-2">
            <Input
              aria-label={`Chave da variante ${index + 1}`}
              value={row.key}
              onChange={(event) => {
                update(row.id, { key: event.target.value });
              }}
            />
            <Input
              aria-label={`Peso da variante ${index + 1} (%)`}
              inputMode="decimal"
              value={row.percent}
              onChange={(event) => {
                update(row.id, { percent: event.target.value });
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={rows.length <= MIN_VARIANTS}
              onClick={() => {
                setRows((current) => current.filter((item) => item.id !== row.id));
              }}
            >
              Remover
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length >= MAX_VARIANTS}
            onClick={() => {
              setRows((current) => [
                ...current,
                { id: Math.max(...current.map((item) => item.id)) + 1, key: '', percent: '0' },
              ]);
            }}
          >
            Adicionar variante
          </Button>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">Total: {total}%</span>
        </div>
      </fieldset>
    </>
  );
}
