import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

import { auth, githubLoginEnabled, signIn } from '@/auth';
import { Button, Card, Field, Input } from '@/components/ui';

/**
 * In Auth.js v5, signIn() throws instead of redirecting when sign-in is refused (for example an
 * email that is not registered, console plan D5). Shows the reason on the login screen instead.
 * The redirect that signIn() throws on success is not an AuthError, so it passes through.
 */
async function signInOrShowError(...args: Parameters<typeof signIn>): Promise<void> {
  try {
    await signIn(...args);
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error;
  }
}

const ERRORS: Record<string, string> = {
  AccessDenied: 'Este e-mail não tem acesso. Peça a um admin para adicionar você a um projeto.',
  Verification: 'Este link expirou ou já foi usado. Peça um novo.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user !== undefined) redirect('/projects');
  const { sent, error } = await searchParams;

  async function sendMagicLink(form: FormData) {
    'use server';
    await signInOrShowError('nodemailer', { email: form.get('email'), redirectTo: '/projects' });
  }

  async function signInWithGitHub() {
    'use server';
    await signInOrShowError('github', { redirectTo: '/projects' });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Lever</h1>
      <Card>
        {sent === undefined ? (
          <form action={sendMagicLink} className="flex flex-col gap-3">
            <Field label="E-mail">
              <Input name="email" type="email" required autoComplete="email" />
            </Field>
            <Button type="submit">Enviar link de acesso</Button>
          </form>
        ) : (
          <p role="status" className="text-sm">
            Enviamos um link de acesso. Confira seu e-mail.
          </p>
        )}
        {error === undefined ? null : (
          <p role="alert" className="mt-3 text-sm text-red-800 dark:text-red-300">
            {ERRORS[error] ?? 'Não foi possível entrar. Tente novamente.'}
          </p>
        )}
        {githubLoginEnabled() ? (
          <form action={signInWithGitHub} className="mt-3">
            <Button type="submit" variant="secondary" className="w-full">
              Entrar com GitHub
            </Button>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
