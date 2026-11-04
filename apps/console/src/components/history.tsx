import { Badge } from './ui';

export interface HistoryEntry {
  id: string;
  action: string;
  resourceType: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
  actorEmail: string;
}

const ACTION_LABELS: Record<string, string> = {
  create: 'criou',
  update: 'alterou',
  delete: 'apagou',
};

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <pre className="overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-800">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** Audit entries with author, date, action and the before/after diff (AC-6.1). */
export function History({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-neutral-500">Sem registros.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge>{entry.resourceType}</Badge>
            <span>
              {entry.actorEmail} {ACTION_LABELS[entry.action] ?? entry.action}
            </span>
            <time className="text-neutral-500" dateTime={entry.createdAt.toISOString()}>
              {entry.createdAt.toLocaleString('pt-BR', { timeZone: 'UTC' })} UTC
            </time>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Json label="Antes" value={entry.before} />
            <Json label="Depois" value={entry.after} />
          </div>
        </li>
      ))}
    </ul>
  );
}
