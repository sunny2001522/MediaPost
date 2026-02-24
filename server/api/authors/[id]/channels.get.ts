import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

/**
 * 取得特定作者關聯的 YouTube 頻道
 */
export default defineEventHandler(async (event) => {
  const authorId = getRouterParam(event, 'id')
  const db = useDB()

  if (!authorId) {
    throw createError({
      statusCode: 400,
      message: 'Author ID is required',
    })
  }

  const channels = await db.query.youtubeChannels.findMany({
    where: eq(schema.youtubeChannels.authorId, authorId),
    orderBy: (channels, { desc }) => [desc(channels.createdAt)],
  })

  return channels
})
