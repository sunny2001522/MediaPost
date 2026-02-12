import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  const db = useDB()

  // 使用 LEFT JOIN 取得作者資訊
  const [result] = await db
    .select({
      podcast: schema.podcasts,
      author: schema.authors,
    })
    .from(schema.podcasts)
    .leftJoin(schema.authors, eq(schema.podcasts.authorId, schema.authors.id))
    .where(eq(schema.podcasts.id, id))

  if (!result) {
    throw createError({ statusCode: 404, message: 'Podcast not found' })
  }

  return {
    ...result.podcast,
    author: result.author,
  }
})
