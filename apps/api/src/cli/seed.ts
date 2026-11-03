/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { bootstrap } from '../database/bootstrap';

/**
 * Idempotent bootstrap seed (roles, units, warehouse structure, stage and category
 * definitions, first administrator from BOOTSTRAP_ADMIN_* when no users exist).
 * Safe to run on every deploy.
 */
async function main() {
  const prisma = new PrismaClient();
  const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password, BOOTSTRAP_ADMIN_NAME: name } = process.env;
  if (password && (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters with letters and digits');
  }
  try {
    await bootstrap(prisma, {
      log: (m) => console.log(`[seed] ${m}`),
      admin: email && password ? { email, password, name: name ?? 'Administrator' } : undefined,
    });
    console.log('[seed] bootstrap complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
