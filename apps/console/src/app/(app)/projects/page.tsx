import Link from 'next/link';

import { createProjectAction } from '@/app/actions/projects';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, Field, Input, PageTitle } from '@/components/ui';
import { pageContext } from '@/server/action';
import { listProjects } from '@/server/projects';

export default async function ProjectsPage() {
  const ctx = await pageContext();
  const projects = await listProjects(ctx);

  return (
    <main className="flex flex-col gap-4">
      <PageTitle>Projetos</PageTitle>
      <Card>
        {projects.length === 0 ? (
          <p className="text-sm text-neutral-500">Você ainda não participa de nenhum projeto.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center gap-2">
                <Link className="underline" href={`/projects/${project.slug}`}>
                  {project.name}
                </Link>
                <Badge>{project.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Novo projeto">
        <ActionForm action={createProjectAction}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input name="name" required maxLength={120} />
            </Field>
            <Field label="Slug">
              <Input name="slug" required maxLength={64} placeholder="minha-loja" />
            </Field>
          </div>
          <div>
            <SubmitButton>Criar projeto</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </main>
  );
}
