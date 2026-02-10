import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  const db = useDB()

  await db.delete(schema.podcasts).where(eq(schema.podcasts.id, id))

  return { success: true }
})
