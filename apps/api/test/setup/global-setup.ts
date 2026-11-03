import { execSync } from 'node:child_process';

/** Apply migrations to the test database once per run. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://puja:puja_dev_password@localhost:5432/puja_os_test?schema=public';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', cwd: __dirname + '/../..' });
}
