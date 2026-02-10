import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing generation ID' })
  }

  const db = useDB()

  await db.delete(schema.generations).where(eq(schema.generations.id, id))

  return { success: true }
})
