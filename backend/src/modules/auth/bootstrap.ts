import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../../config/env.js'
import { hashPassword } from './password.js'
import { provisionCompanyContext } from '../context/service.js'
import { provisionSocialAccounts } from '../performance/accounts.js'

const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for auth:bootstrap.`)
  return value
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface BootstrapInput {
  companyName: string
  companyDescription: string
  userName: string
  userEmail: string
  userPassword: string
}

export async function bootstrapOperator(prisma: PrismaClient, input: BootstrapInput) {
  const userEmail = input.userEmail.trim().toLowerCase()
  const userPassword = input.userPassword
  if (!emailPattern.test(userEmail)) throw new Error('BOOTSTRAP_USER_EMAIL must be a valid email address.')
  if (userPassword.length < 8) throw new Error('BOOTSTRAP_USER_PASSWORD must contain at least 8 characters.')
  const existing = await prisma.user.findFirst({ where: { email: userEmail } })
  if (existing) {
    await provisionCompanyContext(prisma, existing.companyId)
    await provisionSocialAccounts(prisma, existing.companyId)
    return { created: false as const, user: existing }
  }
  const passwordHash = await hashPassword(userPassword)
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: input.companyName, description: input.companyDescription } })
    await provisionCompanyContext(tx, company.id)
    await provisionSocialAccounts(tx, company.id)
    const user = await tx.user.create({ data: { companyId: company.id, name: input.userName, email: userEmail, passwordHash, role: 'founder' } })
    return { created: true as const, company, user }
  })
}

async function main() {
  const config = loadConfig()
  const input = {
    companyName: required('BOOTSTRAP_COMPANY_NAME'),
    companyDescription: required('BOOTSTRAP_COMPANY_DESCRIPTION'),
    userName: required('BOOTSTRAP_USER_NAME'),
    userEmail: required('BOOTSTRAP_USER_EMAIL'),
    userPassword: required('BOOTSTRAP_USER_PASSWORD'),
  }
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } })
  try {
    await prisma.$connect()
    const result = await bootstrapOperator(prisma, input)
    if (!result.created) console.log('Bootstrap skipped: a user with that email already exists.')
    else console.log(`Bootstrap complete: company ${result.company.name}; founder ${result.user.email}.`)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Bootstrap failed.'
    console.error(message)
    process.exitCode = 1
  })
}
