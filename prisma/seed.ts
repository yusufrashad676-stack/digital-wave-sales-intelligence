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

const CONTACT_METHOD_TYPES = [
  { code: 'phone', name: 'Phone', description: 'Primary telephone number', sortOrder: 1, isActive: true },
  { code: 'email', name: 'Email', description: 'Primary email address', sortOrder: 2, isActive: true },
]

const SOCIAL_PLATFORMS = [
  { code: 'facebook', name: 'Facebook', description: 'Facebook profile or page', sortOrder: 1, isActive: true },
  { code: 'instagram', name: 'Instagram', description: 'Instagram profile', sortOrder: 2, isActive: true },
  { code: 'linkedin', name: 'LinkedIn', description: 'LinkedIn company page', sortOrder: 3, isActive: true },
  { code: 'twitter', name: 'Twitter / X', description: 'Twitter (X) profile', sortOrder: 4, isActive: true },
  { code: 'youtube', name: 'YouTube', description: 'YouTube channel', sortOrder: 5, isActive: true },
  { code: 'tiktok', name: 'TikTok', description: 'TikTok profile', sortOrder: 6, isActive: true },
  { code: 'pinterest', name: 'Pinterest', description: 'Pinterest profile', sortOrder: 7, isActive: true },
  { code: 'snapchat', name: 'Snapchat', description: 'Snapchat profile', sortOrder: 8, isActive: true },
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
    for (const type of CONTACT_METHOD_TYPES) {
      await prisma.contactMethodType.upsert({
        where: { code: type.code },
        create: type,
        update: { name: type.name, description: type.description, sortOrder: type.sortOrder, isActive: type.isActive },
      })
    }
    for (const platform of SOCIAL_PLATFORMS) {
      await prisma.socialPlatform.upsert({
        where: { code: platform.code },
        create: platform,
        update: {
          name: platform.name,
          description: platform.description,
          sortOrder: platform.sortOrder,
          isActive: platform.isActive,
        },
      })
    }
    console.log(`Seeded ${SYSTEM_ROLES.length} system roles: ${SYSTEM_ROLES.map((role) => role.code).join(', ')}`)
    console.log(`Seeded ${IMPORT_SOURCES.length} import sources: ${IMPORT_SOURCES.map((source) => source.code).join(', ')}`)
    console.log(`Seeded ${CONTACT_METHOD_TYPES.length} contact method types: ${CONTACT_METHOD_TYPES.map((type) => type.code).join(', ')}`)
    console.log(`Seeded ${SOCIAL_PLATFORMS.length} social platforms: ${SOCIAL_PLATFORMS.map((platform) => platform.code).join(', ')}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
