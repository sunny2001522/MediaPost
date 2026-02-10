import { eq, desc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  const db = useDB()

  // 取得最新的 generation
  const [generation] = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.podcastId, id))
    .orderBy(desc(schema.generations.createdAt))
    .limit(1)

  return generation || null
})
