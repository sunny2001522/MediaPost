import { asc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async () => {
  const db = useDB()

  const result = await db
    .select()
    .from(schema.authors)
    .orderBy(asc(schema.authors.name))

  return result
})
