import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { extractChannelId, subscribeToChannel, generateWebhookSecret } from '~/server/services/youtube/pubsub'
import { getChannelInfo } from '~/server/services/youtube/channel'

/**
 * 新增 YouTube 頻道訂閱
 *
 * Body: {
 *   channelUrl: string  // YouTube 頻道 URL 或 Channel ID
 *   authorId?: string   // 可選的關聯作者 ID
 * }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useRuntimeConfig()
  const db = useDB()

  if (!body.channelUrl) {
    throw createError({
      statusCode: 400,
      message: 'channelUrl is required',
    })
  }

  // 1. 提取 Channel ID 或 handle
  let channelIdOrHandle: string = extractChannelId(body.channelUrl) || body.channelUrl.replace('@', '')

  // 2. 查詢頻道資訊
  const channelInfo = await getChannelInfo(channelIdOrHandle)
  if (!channelInfo) {
    throw createError({
      statusCode: 404,
      message: 'Channel not found',
    })
  }

  // 3. 檢查是否已存在
  const existing = await db.query.youtubeChannels.findFirst({
    where: (channels, { eq }) => eq(channels.channelId, channelInfo.channelId),
  })

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'Channel already subscribed',
    })
  }

  // 4. 建立訂閱記錄
  const id = nanoid()
  const webhookSecret = generateWebhookSecret()
  const now = new Date()

  const channel = {
    id,
    channelId: channelInfo.channelId,
    channelTitle: channelInfo.title,
    channelUrl: `https://www.youtube.com/channel/${channelInfo.channelId}`,
    authorId: body.authorId || null,
    isActive: true,
    webhookSecret,
    subscriptionStatus: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.youtubeChannels).values(channel)

  // 5. 發送 PubSubHubbub 訂閱請求
  const baseUrl = config.public.baseUrl || `https://${event.headers.get('host')}`
  const result = await subscribeToChannel(channelInfo.channelId, webhookSecret, baseUrl)

  if (!result.success) {
    // 訂閱失敗，更新狀態
    await db.update(schema.youtubeChannels)
      .set({
        subscriptionStatus: 'failed',
        subscriptionError: result.error,
        updatedAt: new Date(),
      })
      .where(eq(schema.youtubeChannels.id, id))
  }

  return {
    ...channel,
    subscriptionResult: result,
  }
})
