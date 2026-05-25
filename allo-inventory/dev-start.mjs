/**
 * Dev launcher: boots embedded PostgreSQL, runs migrations, seeds, then starts Next.js.
 * Usage: node dev-start.mjs
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { createConnection } from 'net';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_NAME = 'allo_inventory';
const DB_USER = 'postgres';
const DB_PASS = 'password';
const DB_PORT = 5433; // use 5433 to avoid conflicts with any existing postgres
const DB_URL = `postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}`;

const server = new EmbeddedPostgres({
  databaseDir: path.join(__dirname, 'data', 'pgdata'),
  user: DB_USER,
  password: DB_PASS,
  port: DB_PORT,
  persistent: true,
});

async function runSql(url, sql) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function runCommand(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...env },
      cwd: __dirname,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  console.log('\n[dev-start] Initialising embedded PostgreSQL...');
  await server.initialise();
  await server.start();
  console.log(`[dev-start] PostgreSQL running on port ${DB_PORT}`);

  // Create database if it doesn't exist
  const defaultUrl = `postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/postgres`;
  const adminClient = new Client({ connectionString: defaultUrl });
  await adminClient.connect();
  const { rows } = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]);
  if (rows.length === 0) {
    await adminClient.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`[dev-start] Created database "${DB_NAME}"`);
  } else {
    console.log(`[dev-start] Database "${DB_NAME}" already exists`);
  }
  await adminClient.end();

  // Write .env.local
  await writeFile(
    path.join(__dirname, '.env.local'),
    `DATABASE_URL="${DB_URL}"\nCRON_SECRET="dev-local-secret"\n`
  );
  console.log('[dev-start] Written .env.local');

  // Apply schema via drizzle-kit push
  console.log('[dev-start] Applying schema (drizzle-kit push)...');
  await runCommand('npx', ['drizzle-kit', 'push', '--force'], { DATABASE_URL: DB_URL });

  // Seed data
  console.log('[dev-start] Seeding database...');
  await runCommand('npx', ['tsx', 'drizzle/seed.ts'], { DATABASE_URL: DB_URL });

  // Start Next.js
  console.log('\n[dev-start] Starting Next.js dev server...\n');
  const next = spawn('npx', ['next', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: DB_URL },
    cwd: __dirname,
  });

  const shutdown = async () => {
    console.log('\n[dev-start] Shutting down...');
    next.kill();
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[dev-start] Fatal:', err);
  process.exit(1);
});
