import { users, type Database } from '@lever/db';
import { eq } from 'drizzle-orm';

/** Only emails already registered by an admin can sign in (AC-7.1, console plan D5). */
export async function isRegisteredEmail(
  db: Database,
  email: string | null | undefined,
): Promise<boolean> {
  if (email === null || email === undefined) return false;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return user !== undefined;
}
