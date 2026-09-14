import { Prisma, type PrismaClient } from '@prisma/client'

type AccountDb = PrismaClient | Prisma.TransactionClient

// Kept as a small setup helper so read selectors never provision state as a
// side effect. The migration backfills existing companies; bootstrap handles
// companies created after that migration.
export async function provisionSocialAccounts(db: AccountDb, companyId: string) {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { reportingTimezone: true } })
  if (!company) throw new Error('Cannot provision social accounts for a missing company.')
  await db.socialAccount.upsert({
    where: { companyId_platform: { companyId, platform: 'instagram' } },
    create: { companyId, platform: 'instagram', mode: 'demo', connectionStatus: 'disconnected', reportingTimezone: company.reportingTimezone },
    update: {},
  })
  for (const platform of ['linkedin', 'whatsapp'] as const) {
    await db.socialAccount.upsert({
      where: { companyId_platform: { companyId, platform } },
      create: { companyId, platform, mode: 'manual', connectionStatus: 'manual', reportingTimezone: company.reportingTimezone },
      update: {},
    })
  }
}
