import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../backend/src/database/generated/prisma/client.js'

const SYSTEM_ROLES = [
  { code: 'ADMIN', name: 'Administrator', description: 'Full platform access across the application.' },
  { code: 'MEMBER', name: 'Member', description: 'Standard member with workspace-level access.' },
  { code: 'GUEST', name: 'Guest', description: 'Read-only guest access.' },
]

const IMPORT_SOURCES = [
  { code: 'google-places', name: 'Google Places', category: 'maps', capabilities: ['search', 'lookup'] },
  { code: 'mock', name: 'Mock Search Provider', category: 'mock', capabilities: ['search'] },
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
    for (const source of IMPORT_SOURCES) {
      await prisma.importSource.upsert({
        where: { code: source.code },
        create: source,
        update: { name: source.name, category: source.category, enabled: true, capabilities: source.capabilities },
      })
    }
    console.log(`Seeded ${SYSTEM_ROLES.length} system roles: ${SYSTEM_ROLES.map((role) => role.code).join(', ')}`)
    console.log(`Seeded ${IMPORT_SOURCES.length} import sources: ${IMPORT_SOURCES.map((source) => source.code).join(', ')}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
