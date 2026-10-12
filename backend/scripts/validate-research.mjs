import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const backendDir = resolve(import.meta.dirname, '..')
const repositoryDir = resolve(backendDir, '..')
const frontendDir = resolve(repositoryDir, 'frontend')
const results = []

function run(label, cwd, command, args, extraEnv = {}) {
  console.log(`\n[RUN] ${label}`)
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: 'inherit' })
  const passed = result.status === 0
  results.push({ label, status: passed ? 'PASS' : 'FAIL' })
  if (!passed) console.error(`[FAIL] ${label}${result.error ? `: ${result.error.message}` : ''}`)
  return passed
}

async function testDatabaseReady() {
  const value = process.env.TEST_DATABASE_URL
  if (!value) {
    console.error('[BLOCKED] TEST_DATABASE_URL is not configured.')
    return false
  }
  if (value === process.env.DATABASE_URL) {
    console.error('[BLOCKED] TEST_DATABASE_URL must differ from DATABASE_URL.')
    return false
  }
  let parsed
  try { parsed = new URL(value) } catch {
    console.error('[BLOCKED] TEST_DATABASE_URL is not a valid URL.')
    return false
  }
  if (parsed.pathname.replace(/^\//, '') !== 'shifd_marketing_test') {
    console.error('[BLOCKED] Automated database validation is restricted to shifd_marketing_test.')
    return false
  }

  const prisma = new PrismaClient({ datasources: { db: { url: value } } })
  try {
    const rows = await prisma.$queryRaw`SELECT current_database() AS name`
    if (rows[0]?.name !== 'shifd_marketing_test') {
      console.error('[BLOCKED] Connected database name did not match shifd_marketing_test.')
      return false
    }
    console.log('[PASS] Read-only connection check reached shifd_marketing_test.')
    return true
  } catch (error) {
    const kind = error instanceof Error ? error.name : 'DatabaseError'
    console.error(`[BLOCKED] Test database connection failed (${kind}); database integration will not be retried.`)
    return false
  } finally {
    await prisma.$disconnect()
  }
}

const databaseReady = await testDatabaseReady()
if (databaseReady) {
  run('Backend unit and database integration tests', backendDir, 'npm', ['exec', '--', 'vitest', 'run', '--no-file-parallelism', 'tests'], { REQUIRE_DATABASE: '1' })
} else {
  results.push({ label: 'Backend database integration tests', status: 'BLOCKED' })
  run('Backend unit tests (database integration suites remain skipped)', backendDir, 'npm', ['run', 'test:unit'])
}

run('Prisma schema validation', backendDir, 'npx', ['prisma', 'validate'])
run('Backend TypeScript build', backendDir, 'npm', ['run', 'build'])
run('Frontend tests', frontendDir, 'npm', ['test'])
run('Frontend production build', frontendDir, 'npm', ['run', 'build'])
run('Git whitespace validation', repositoryDir, 'git', ['diff', '--check'])

console.log('\nResearch validation summary:')
for (const result of results) console.log(`- ${result.status}: ${result.label}`)

if (results.some((result) => result.status !== 'PASS')) process.exitCode = 1
