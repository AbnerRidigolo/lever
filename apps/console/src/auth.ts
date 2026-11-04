import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { accounts, sessions, users, verificationTokens } from '@lever/db';
import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import GitHub from 'next-auth/providers/github';
import Nodemailer from 'next-auth/providers/nodemailer';

import { db } from '@/server/db';
import { consoleEnv } from '@/server/env';
import { isRegisteredEmail } from '@/server/sign-in';

export function githubLoginEnabled(): boolean {
  const env = consoleEnv();
  return env.AUTH_GITHUB_ID !== undefined && env.AUTH_GITHUB_SECRET !== undefined;
}

// Lazy, because `next build` loads this file without a runtime environment.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = consoleEnv();
  return {
    adapter: DrizzleAdapter(db(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    // Database sessions, so removing a member takes effect immediately (console plan, D2).
    session: { strategy: 'database' },
    pages: { signIn: '/login', verifyRequest: '/login?sent=1', error: '/login' },
    providers: [
      // The cast only bridges a mismatch of the Auth.js types under exactOptionalPropertyTypes.
      Nodemailer({ server: env.EMAIL_SERVER, from: env.EMAIL_FROM }) as Provider,
      ...(env.AUTH_GITHUB_ID !== undefined && env.AUTH_GITHUB_SECRET !== undefined
        ? [
            GitHub({
              clientId: env.AUTH_GITHUB_ID,
              clientSecret: env.AUTH_GITHUB_SECRET,
              // Same email, same account; only registered emails get here (console plan, D5, D6).
              allowDangerousEmailAccountLinking: true,
            }),
          ]
        : []),
    ],
    callbacks: {
      signIn: ({ user }) => isRegisteredEmail(db(), user.email),
      session: ({ session, user }) => ({ ...session, user: { ...session.user, id: user.id } }),
    },
  };
});
