import Link from 'next/link';

import { createSegmentAction } from '@/app/actions/segments';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { RulesEditor } from '@/components/rules-editor';
import { Card, Field, Input, PageTitle } from '@/components/ui';
import { loadOrDeny, pageContext } from '@/server/action';
import { hasRole, requireRole } from '@/server/authz';
import { listSegments } from '@/server/segments';

export default async function SegmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageContext();
  const [access, segments] = await loadOrDeny(() =>
    Promise.all([requireRole(ctx, { slug }, 'viewer'), listSegments(ctx, { slug })]),
  );

  return (
    <main className="flex flex-col gap-4">
      <PageTitle>Segmentos</PageTitle>
      <Card>
        {segments.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum segmento ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {segments.map((segment) => (
              <li key={segment.id}>
                <Link
                  className="font-medium underline"
                  href={`/projects/${slug}/segments/${segment.id}`}
                >
                  {segment.key}
                </Link>{' '}
                — {segment.name}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {hasRole(access.role, 'editor') ? (
        <Card title="Novo segmento">
          <ActionForm action={createSegmentAction.bind(null, slug)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Chave">
                <Input name="key" required maxLength={64} placeholder="br-mobile" />
              </Field>
              <Field label="Nome">
                <Input name="name" required maxLength={120} />
              </Field>
            </div>
            <RulesEditor />
            <div>
              <SubmitButton>Criar segmento</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </main>
  );
}
