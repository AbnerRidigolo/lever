import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '@lever/schemas';
import Link from 'next/link';

import { History } from '@/components/history';
import { Button, Card, Field, Input, PageTitle, Select } from '@/components/ui';
import { loadOrDeny, pageContext } from '@/server/action';
import { listAuditEntries } from '@/server/audit';
import { listMembers } from '@/server/projects';

type Search = Record<string, string | string[] | undefined>;

/** Empty form fields mean "no filter". */
function filledFilters(search: Search): Record<string, string> {
  const filled: Record<string, string> = {};
  for (const name of ['resourceType', 'actorId', 'action', 'from', 'to', 'page']) {
    const value = search[name];
    if (typeof value === 'string' && value !== '') filled[name] = value;
  }
  return filled;
}

/** Read-only history, filterable by resource, author and period (AC-6.2). */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const filters = filledFilters(await searchParams);
  const ctx = await pageContext();
  const [result, members] = await loadOrDeny(() =>
    Promise.all([listAuditEntries(ctx, { slug }, filters), listMembers(ctx, { slug })]),
  );
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const linkTo = (page: number) =>
    `/projects/${slug}/audit?${new URLSearchParams({ ...filters, page: String(page) }).toString()}`;

  return (
    <main className="flex flex-col gap-4">
      <PageTitle>Auditoria</PageTitle>
      <Card>
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Recurso">
            <Select name="resourceType" defaultValue={filters.resourceType ?? ''}>
              <option value="">Todos</option>
              {AUDIT_RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ação">
            <Select name="action" defaultValue={filters.action ?? ''}>
              <option value="">Todas</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Autor">
            <Select name="actorId" defaultValue={filters.actorId ?? ''}>
              <option value="">Todos</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="De">
            <Input name="from" type="date" defaultValue={filters.from ?? ''} />
          </Field>
          <Field label="Até">
            <Input name="to" type="date" defaultValue={filters.to ?? ''} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <p className="mb-3 text-sm text-neutral-500">{result.total} registros</p>
        <History entries={result.entries} />
        {pages > 1 ? (
          <nav className="mt-3 flex items-center gap-3 text-sm">
            {result.page > 1 ? <Link href={linkTo(result.page - 1)}>Anterior</Link> : null}
            <span>
              Página {result.page} de {pages}
            </span>
            {result.page < pages ? <Link href={linkTo(result.page + 1)}>Próxima</Link> : null}
          </nav>
        ) : null}
      </Card>
    </main>
  );
}
