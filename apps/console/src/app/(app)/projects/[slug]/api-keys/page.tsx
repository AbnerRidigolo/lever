import { createApiKeyAction, revokeApiKeyAction } from '@/app/actions/api-keys';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { CreateApiKeyForm } from '@/components/create-api-key-form';
import { Badge, Card, PageTitle } from '@/components/ui';
import { loadOrDeny, pageContext } from '@/server/action';
import { listApiKeys } from '@/server/api-keys';

export default async function ApiKeysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageContext();
  const keys = await loadOrDeny(() => listApiKeys(ctx, { slug }));

  return (
    <main className="flex flex-col gap-4">
      <PageTitle>API keys</PageTitle>
      <Card title="Nova API key">
        <CreateApiKeyForm action={createApiKeyAction.bind(null, slug)} />
      </Card>
      <Card>
        {keys.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma API key ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{key.name}</span>
                <code>{key.prefix}…</code>
                <Badge>{key.environment}</Badge>
                {key.revokedAt === null ? (
                  <ActionForm action={revokeApiKeyAction.bind(null, slug, key.id)}>
                    <SubmitButton variant="danger">Revogar {key.name}</SubmitButton>
                  </ActionForm>
                ) : (
                  <Badge tone="red">revogada</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
