import { EXPERIMENT_STATUSES } from '@lever/schemas';

import {
  deleteExperimentAction,
  transitionExperimentAction,
  updateExperimentAction,
} from '@/app/actions/experiments';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { History } from '@/components/history';
import { Badge, Card, Field, PageTitle, Select, Textarea } from '@/components/ui';
import { VariantsEditor } from '@/components/variants-editor';
import { bpsToPercent } from '@/lib/form';
import { loadOrDeny, pageContext } from '@/server/action';
import { listAuditEntries } from '@/server/audit';
import { hasRole, requireRole } from '@/server/authz';
import { canTransition, getExperiment } from '@/server/experiments';
import { listSegments } from '@/server/segments';

const TRANSITION_LABELS = {
  draft: '',
  running: 'Iniciar',
  paused: 'Pausar',
  completed: 'Concluir',
};

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await pageContext();
  const [access, experiment, segments, history] = await loadOrDeny(() =>
    Promise.all([
      requireRole(ctx, { slug }, 'viewer'),
      getExperiment(ctx, { slug }, id),
      listSegments(ctx, { slug }),
      listAuditEntries(ctx, { slug }, { resourceId: id }),
    ]),
  );
  const canEdit = hasRole(access.role, 'editor');
  const completed = experiment.status === 'completed';
  const running = experiment.environments.some((env) => env.status === 'running');

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <PageTitle>{experiment.key}</PageTitle>
        <Badge tone={experiment.status === 'running' ? 'green' : 'neutral'}>
          {experiment.status}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {experiment.environments.map((env) => (
          <Card key={env.environment} title={env.environment}>
            <p className="mb-3 text-sm">
              Estado:{' '}
              <Badge tone={env.status === 'running' ? 'green' : 'neutral'}>{env.status}</Badge>
            </p>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                {EXPERIMENT_STATUSES.filter((to) => canTransition(env.status, to)).map((to) => (
                  <ActionForm
                    key={to}
                    action={transitionExperimentAction.bind(null, slug, id, env.environment, to)}
                  >
                    <SubmitButton variant={to === 'running' ? 'primary' : 'secondary'}>
                      {TRANSITION_LABELS[to]} em {env.environment}
                    </SubmitButton>
                  </ActionForm>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      <Card title="Definição">
        {canEdit && !completed ? (
          <ActionForm action={updateExperimentAction.bind(null, slug, id)}>
            {running ? (
              <p role="note" className="rounded-md bg-amber-50 p-2 text-sm dark:bg-amber-950">
                O experimento está em execução. Para mudar variantes, pesos ou segmento, pause-o em
                todos os ambientes.
              </p>
            ) : experiment.startedAt !== null ? (
              <p role="note" className="rounded-md bg-amber-50 p-2 text-sm dark:bg-amber-950">
                Atenção: mudar variantes, pesos ou segmento depois de iniciar invalida a análise
                deste experimento.
              </p>
            ) : null}
            <Field label="Hipótese">
              <Textarea
                name="hypothesis"
                required
                maxLength={2000}
                rows={2}
                defaultValue={experiment.hypothesis}
              />
            </Field>
            <VariantsEditor initial={experiment.variants} disabled={running} />
            <Field label="Segmento">
              <Select
                name="segmentKey"
                defaultValue={experiment.segmentKey ?? ''}
                disabled={running}
              >
                <option value="">Todos os usuários</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.key}>
                    {segment.key}
                  </option>
                ))}
              </Select>
            </Field>
            {running ? (
              // Disabled fields are not submitted, so the current values go along unchanged.
              <input type="hidden" name="segmentKey" value={experiment.segmentKey ?? ''} />
            ) : null}
            <div>
              <SubmitButton>Salvar experimento</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <dl className="flex flex-col gap-1 text-sm">
            <div>Hipótese: {experiment.hypothesis}</div>
            <div>
              Variantes:{' '}
              {experiment.variants
                .map((variant) => `${variant.key} ${bpsToPercent(variant.weightBps)}%`)
                .join(', ')}
            </div>
            <div>Segmento: {experiment.segmentKey ?? 'todos os usuários'}</div>
          </dl>
        )}
      </Card>

      <Card title="Histórico">
        <History entries={history.entries} />
      </Card>

      {canEdit && !running ? (
        <ActionForm action={deleteExperimentAction.bind(null, slug, id)}>
          <div>
            <SubmitButton variant="danger">Apagar experimento</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </main>
  );
}
