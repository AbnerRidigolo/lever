import { FLAG_TYPES } from '@lever/schemas';
import Link from 'next/link';

import { createFlagAction } from '@/app/actions/flags';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, Field, Input, PageTitle, Select } from '@/components/ui';
import { bpsToPercent } from '@/lib/form';
import { loadOrDeny, pageContext } from '@/server/action';
import { hasRole, requireRole } from '@/server/authz';
import { listFlags } from '@/server/flags';

export default async function FlagsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageContext();
  const [access, flags] = await loadOrDeny(() =>
    Promise.all([requireRole(ctx, { slug }, 'viewer'), listFlags(ctx, { slug })]),
  );

  return (
    <main className="flex flex-col gap-4">
      <PageTitle>Flags</PageTitle>
      <Card>
        {flags.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma flag ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {flags.map((flag) => (
              <li key={flag.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link className="font-medium underline" href={`/projects/${slug}/flags/${flag.id}`}>
                  {flag.key}
                </Link>
                <Badge>{flag.type}</Badge>
                {flag.environments.map((env) => (
                  <Badge key={env.environment} tone={env.enabled ? 'green' : 'neutral'}>
                    {env.environment}:{' '}
                    {env.enabled ? `ligada ${bpsToPercent(env.rolloutBps)}%` : 'desligada'}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {hasRole(access.role, 'editor') ? (
        <Card title="Nova flag">
          <ActionForm action={createFlagAction.bind(null, slug)}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Chave">
                <Input name="key" required maxLength={64} placeholder="new-banner" />
              </Field>
              <Field label="Tipo">
                <Select name="type" defaultValue="boolean">
                  {FLAG_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valor padrão">
                <Input name="defaultValue" placeholder="false" />
              </Field>
            </div>
            <div>
              <SubmitButton>Criar flag</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </main>
  );
}
