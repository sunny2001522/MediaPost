import { desc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Number(query.limit) || 10

  const db = useDB()

  const events = await db
    .select()
    .from(schema.learningEvents)
    .orderBy(desc(schema.learningEvents.createdAt))
    .limit(limit)

  return events
})
