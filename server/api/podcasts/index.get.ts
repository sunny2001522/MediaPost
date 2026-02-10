import { desc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async () => {
  const db = useDB()

  const podcasts = await db
    .select()
    .from(schema.podcasts)
    .orderBy(desc(schema.podcasts.createdAt))

  return podcasts
})
