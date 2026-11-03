// Loaded before every integration test file.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://puja:puja_dev_password@localhost:5432/puja_os_test?schema=public';
process.env.JOBS_ENABLED = 'false';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-0123456789abcdefghij';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR ?? '/tmp/puja-test-storage';
delete process.env.ANTHROPIC_API_KEY;
