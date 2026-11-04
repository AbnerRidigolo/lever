import Link from 'next/link';

import { createExperimentAction } from '@/app/actions/experiments';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, Field, Input, PageTitle, Select, Textarea } from '@/components/ui';
import { VariantsEditor } from '@/components/variants-editor';
import { loadOrDeny, pageContext } from '@/server/action';
import { hasRole, requireRole } from '@/server/authz';
import { listExperiments } from '@/server/experiments';
import { listSegments } from '@/server/segments';

export default async function ExperimentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageContext();
  const [access, experiments, segments] = await loadOrDeny(() =>
    Promise.all([
      requireRole(ctx, { slug }, 'viewer'),
      listExperiments(ctx, { slug }),
      listSegments(ctx, { slug }),
    ]),
  );

  return (
    <main className="flex flex-col gap-4">
      <PageTitle>Experimentos</PageTitle>
      <Card>
        {experiments.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum experimento ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {experiments.map((experiment) => (
              <li key={experiment.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  className="font-medium underline"
                  href={`/projects/${slug}/experiments/${experiment.id}`}
                >
                  {experiment.key}
                </Link>
                {experiment.environments.map((env) => (
                  <Badge
                    key={env.environment}
                    tone={env.status === 'running' ? 'green' : 'neutral'}
                  >
                    {env.environment}: {env.status}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {hasRole(access.role, 'editor') ? (
        <Card title="Novo experimento">
          <ActionForm action={createExperimentAction.bind(null, slug)}>
            <Field label="Chave">
              <Input name="key" required maxLength={64} placeholder="checkout-layout" />
            </Field>
            <Field label="Hipótese">
              <Textarea name="hypothesis" required maxLength={2000} rows={2} />
            </Field>
            <VariantsEditor />
            <Field label="Segmento">
              <Select name="segmentKey" defaultValue="">
                <option value="">Todos os usuários</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.key}>
                    {segment.key}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <SubmitButton>Criar experimento</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </main>
  );
}
