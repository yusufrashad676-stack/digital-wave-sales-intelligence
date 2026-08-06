import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

const SYSTEM_ROLES = [
  { code: 'ADMIN', name: 'Administrator', description: 'Full platform access across the application.' },
  { code: 'MEMBER', name: 'Member', description: 'Standard member with workspace-level access.' },
  { code: 'GUEST', name: 'Guest', description: 'Read-only guest access.' },
]

async function main() {
  const directUrl = process.env.DIRECT_DATABASE_URL
  if (!directUrl) {
    throw new Error('DIRECT_DATABASE_URL is required to run the seed')
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: directUrl }) })
  try {
    for (const role of SYSTEM_ROLES) {
      await prisma.role.upsert({
        where: { code: role.code },
        create: { ...role, kind: 'SYSTEM', status: 'ACTIVE' },
        update: { name: role.name, description: role.description, kind: 'SYSTEM', status: 'ACTIVE' },
      })
    }
    console.log(`Seeded ${SYSTEM_ROLES.length} system roles: ${SYSTEM_ROLES.map((role) => role.code).join(', ')}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
