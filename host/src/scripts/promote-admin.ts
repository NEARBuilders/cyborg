/**
 * Promote User to Admin
 *
 * Usage: bun run promote-admin <near-account-id>
 * Example: bun run promote-admin alice.near
 */

import { db } from '../db';
import { user, nearAccount } from '../db/schema/auth';
import { eq } from 'drizzle-orm';

async function promoteToAdmin(nearAccountId: string) {
  // Find user by NEAR account ID
  const account = await db.query.nearAccount.findFirst({
    where: eq(nearAccount.accountId, nearAccountId),
  });

  if (!account) {
    console.error(`❌ No user found with NEAR account: ${nearAccountId}`);
    process.exit(1);
  }

  // Update user role
  const result = await db
    .update(user)
    .set({ role: 'admin' })
    .where(eq(user.id, account.userId))
    .returning();

  if (result.length > 0) {
    console.log(`✅ Promoted ${nearAccountId} to admin`);
    console.log(`   User ID: ${result[0].id}`);
    console.log(`   Email: ${result[0].email}`);
  } else {
    console.error(`❌ Failed to promote user`);
    process.exit(1);
  }
}

const nearAccountId = process.argv[2];
if (!nearAccountId) {
  console.error('Usage: bun run promote-admin <near-account-id>');
  process.exit(1);
}

promoteToAdmin(nearAccountId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
