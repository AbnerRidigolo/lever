import { deleteSegmentAction, updateSegmentAction } from '@/app/actions/segments';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { History } from '@/components/history';
import { RulesEditor } from '@/components/rules-editor';
import { Card, Field, Input, PageTitle } from '@/components/ui';
import { formatRuleValue } from '@/lib/form';
import { loadOrDeny, pageContext } from '@/server/action';
import { listAuditEntries } from '@/server/audit';
import { hasRole, requireRole } from '@/server/authz';
import { getSegment } from '@/server/segments';

export default async function SegmentPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await pageContext();
  const [access, segment, history] = await loadOrDeny(() =>
    Promise.all([
      requireRole(ctx, { slug }, 'viewer'),
      getSegment(ctx, { slug }, id),
      listAuditEntries(ctx, { slug }, { resourceId: id }),
    ]),
  );
  const canEdit = hasRole(access.role, 'editor');

  return (
    <main className="flex flex-col gap-4">
      <PageTitle>{segment.key}</PageTitle>
      <Card title="Definição">
        {canEdit ? (
          <ActionForm action={updateSegmentAction.bind(null, slug, id)}>
            <Field label="Nome">
              <Input name="name" required maxLength={120} defaultValue={segment.name} />
            </Field>
            <RulesEditor initial={segment.rules} />
            <div>
              <SubmitButton>Salvar segmento</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <p>{segment.name}</p>
            <ul className="list-inside list-disc">
              {segment.rules.conditions.map((condition) => (
                <li key={`${condition.attribute}:${condition.operator}`}>
                  {condition.attribute} {condition.operator} {formatRuleValue(condition.value)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card title="Histórico">
        <History entries={history.entries} />
      </Card>
      {canEdit ? (
        <ActionForm action={deleteSegmentAction.bind(null, slug, id)}>
          <div>
            <SubmitButton variant="danger">Apagar segmento</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </main>
  );
}
