import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  const db = useDB()

  const [podcast] = await db
    .select()
    .from(schema.podcasts)
    .where(eq(schema.podcasts.id, id))

  if (!podcast) {
    throw createError({ statusCode: 404, message: 'Podcast not found' })
  }

  return podcast
})
