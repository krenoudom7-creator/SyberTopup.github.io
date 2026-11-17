import { eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  avatarUrl?: string
) {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          email,
          displayName: displayName || existing[0].displayName,
          avatarUrl: avatarUrl || existing[0].avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, uid))
        .returning();
      return updated[0];
    }

    // Bootstrap first admin or configured ADMIN_EMAIL / owner account
    const adminCountRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'admin'));
    const adminCount = adminCountRes[0]?.count ?? 0;

    const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const isBootstrapAdmin =
      adminCount === 0 ||
      (configuredAdminEmail && email.toLowerCase() === configuredAdminEmail) ||
      email.toLowerCase() === 'sofymaradin@gmail.com';

    const inserted = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        avatarUrl: avatarUrl || '',
        role: isBootstrapAdmin ? 'admin' : 'customer',
        permissions: isBootstrapAdmin
          ? ['games:write', 'products:write', 'orders:write', 'suppliers:write', 'users:write', 'settings:write']
          : [],
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || email.split('@')[0],
          avatarUrl: avatarUrl || '',
          updatedAt: new Date(),
        },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Failed to sync user in PostgreSQL:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);
    return result[0] ?? null;
  } catch (error) {
    console.error('Failed to query user by UID:', error);
    throw new Error('Database query failed.', { cause: error });
  }
}
