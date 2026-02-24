import { useDB, schema } from '~/server/database/client'
import { desc } from 'drizzle-orm'

/**
 * 列出所有 YouTube 頻道訂閱
 */
export default defineEventHandler(async () => {
  const db = useDB()

  const channels = await db.query.youtubeChannels.findMany({
    orderBy: [desc(schema.youtubeChannels.createdAt)],
  })

  // 取得關聯的作者資訊
  const channelsWithAuthors = await Promise.all(
    channels.map(async (channel) => {
      let author = null
      if (channel.authorId) {
        author = await db.query.authors.findFirst({
          where: (authors, { eq }) => eq(authors.id, channel.authorId!),
        })
      }
      return {
        ...channel,
        author: author ? { id: author.id, name: author.name } : null,
      }
    })
  )

  return channelsWithAuthors
})
