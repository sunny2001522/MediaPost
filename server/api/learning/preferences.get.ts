import { desc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async () => {
  const db = useDB()

  const preferences = await db
    .select()
    .from(schema.learnedPreferences)
    .orderBy(desc(schema.learnedPreferences.confidence))

  return preferences
})
