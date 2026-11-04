import { PROJECT_ROLES } from '@lever/schemas';

import {
  addMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
} from '@/app/actions/projects';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, Field, Input, PageTitle, Select } from '@/components/ui';
import { loadOrDeny, pageContext } from '@/server/action';
import { hasRole, requireRole } from '@/server/authz';
import { listMembers } from '@/server/projects';

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await pageContext();
  const [access, members] = await loadOrDeny(() =>
    Promise.all([requireRole(ctx, { slug }, 'viewer'), listMembers(ctx, { slug })]),
  );
  const isAdmin = hasRole(access.role, 'admin');

  return (
    <main className="flex flex-col gap-4">
      <PageTitle>Membros</PageTitle>
      <Card>
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 text-sm">
              <span>{member.email}</span>
              {isAdmin ? (
                <>
                  <ActionForm
                    action={changeMemberRoleAction.bind(null, slug, member.userId)}
                    className="flex items-center gap-2"
                  >
                    <Select
                      name="role"
                      defaultValue={member.role}
                      aria-label={`Papel de ${member.email}`}
                    >
                      {PROJECT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton variant="secondary">Salvar</SubmitButton>
                  </ActionForm>
                  <ActionForm action={removeMemberAction.bind(null, slug, member.userId)}>
                    <SubmitButton variant="danger">Remover</SubmitButton>
                  </ActionForm>
                </>
              ) : (
                <Badge>{member.role}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {isAdmin ? (
        <Card title="Adicionar membro">
          <ActionForm action={addMemberAction.bind(null, slug)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="E-mail">
                <Input name="email" type="email" required />
              </Field>
              <Field label="Papel">
                <Select name="role" defaultValue="viewer">
                  {PROJECT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div>
              <SubmitButton>Adicionar</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </main>
  );
}
