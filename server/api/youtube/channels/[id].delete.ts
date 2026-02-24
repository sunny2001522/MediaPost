import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { unsubscribeFromChannel } from '~/server/services/youtube/pubsub'

/**
 * 刪除 YouTube 頻道訂閱
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const config = useRuntimeConfig()
  const db = useDB()

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Channel ID is required',
    })
  }

  // 取得頻道資訊
  const channel = await db.query.youtubeChannels.findFirst({
    where: eq(schema.youtubeChannels.id, id),
  })

  if (!channel) {
    throw createError({
      statusCode: 404,
      message: 'Channel not found',
    })
  }

  // 發送取消訂閱請求
  const baseUrl = config.public.baseUrl || `https://${event.headers.get('host')}`
  await unsubscribeFromChannel(channel.channelId, channel.webhookSecret, baseUrl)

  // 刪除記錄
  await db.delete(schema.youtubeChannels)
    .where(eq(schema.youtubeChannels.id, id))

  return { success: true }
})
