import {
  deleteFlagAction,
  updateFlagDefaultAction,
  updateFlagEnvironmentAction,
} from '@/app/actions/flags';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { History } from '@/components/history';
import { Badge, Card, Field, Input, PageTitle, Select } from '@/components/ui';
import { bpsToPercent, formatFlagValue } from '@/lib/form';
import { loadOrDeny, pageContext } from '@/server/action';
import { listAuditEntries } from '@/server/audit';
import { hasRole, requireRole } from '@/server/authz';
import { getFlag } from '@/server/flags';
import { listSegments } from '@/server/segments';

export default async function FlagPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await pageContext();
  const [access, flag, segments, history] = await loadOrDeny(() =>
    Promise.all([
      requireRole(ctx, { slug }, 'viewer'),
      getFlag(ctx, { slug }, id),
      listSegments(ctx, { slug }),
      listAuditEntries(ctx, { slug }, { resourceId: id }),
    ]),
  );
  const canEdit = hasRole(access.role, 'editor');

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <PageTitle>{flag.key}</PageTitle>
        <Badge>{flag.type}</Badge>
      </div>

      <Card title="Valor padrão">
        {canEdit ? (
          <ActionForm action={updateFlagDefaultAction.bind(null, slug, id)}>
            <Field label="Valor padrão">
              <Input name="defaultValue" defaultValue={formatFlagValue(flag.defaultValue)} />
            </Field>
            <div>
              <SubmitButton variant="secondary">Salvar valor padrão</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <code className="text-sm">{formatFlagValue(flag.defaultValue)}</code>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {flag.environments.map((env) => (
          <Card key={env.environment} title={env.environment}>
            {canEdit ? (
              <ActionForm
                action={updateFlagEnvironmentAction.bind(null, slug, id, env.environment)}
              >
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={env.enabled}
                    aria-label={`Ligada em ${env.environment}`}
                  />
                  Ligada
                </label>
                <Field label="Valor servido">
                  <Input name="servedValue" defaultValue={formatFlagValue(env.servedValue)} />
                </Field>
                <Field label="Rollout (%)">
                  <Input
                    name="rolloutPercent"
                    inputMode="decimal"
                    defaultValue={bpsToPercent(env.rolloutBps)}
                  />
                </Field>
                <Field label="Segmento">
                  <Select name="segmentKey" defaultValue={env.segmentKey ?? ''}>
                    <option value="">Todos os usuários</option>
                    {segments.map((segment) => (
                      <option key={segment.id} value={segment.key}>
                        {segment.key}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div>
                  <SubmitButton>Salvar {env.environment}</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <dl className="flex flex-col gap-1 text-sm">
                <div>
                  <Badge tone={env.enabled ? 'green' : 'neutral'}>
                    {env.enabled ? 'ligada' : 'desligada'}
                  </Badge>
                </div>
                <div>Valor servido: {formatFlagValue(env.servedValue)}</div>
                <div>Rollout: {bpsToPercent(env.rolloutBps)}%</div>
                <div>Segmento: {env.segmentKey ?? 'todos os usuários'}</div>
              </dl>
            )}
          </Card>
        ))}
      </div>

      <Card title="Histórico">
        <History entries={history.entries} />
      </Card>

      {canEdit ? (
        <ActionForm action={deleteFlagAction.bind(null, slug, id)}>
          <div>
            <SubmitButton variant="danger">Apagar flag</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </main>
  );
}
