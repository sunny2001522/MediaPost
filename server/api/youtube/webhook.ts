import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { parseAtomFeed, verifyHmacSignature } from '~/server/services/youtube/pubsub'
import { inngest } from '~/server/services/inngest'

/**
 * YouTube PubSubHubbub Webhook 端點
 *
 * GET: 處理訂閱驗證 (hub.challenge)
 * POST: 處理新影片通知
 */
export default defineEventHandler(async (event) => {
  const db = useDB()

  // GET: 訂閱驗證
  if (event.method === 'GET') {
    const query = getQuery(event)
    const mode = query['hub.mode'] as string
    const topic = query['hub.topic'] as string
    const challenge = query['hub.challenge'] as string
    const leaseSeconds = query['hub.lease_seconds'] as string

    console.log(`[Webhook] Verification request: mode=${mode}, topic=${topic}`)

    if (mode === 'subscribe' || mode === 'unsubscribe') {
      // 從 topic 提取 channel ID
      const channelIdMatch = topic?.match(/channel_id=([^&]+)/)
      const channelId = channelIdMatch ? channelIdMatch[1] : null

      if (channelId) {
        // 更新訂閱狀態
        if (mode === 'subscribe') {
          const expiresAt = leaseSeconds
            ? new Date(Date.now() + parseInt(leaseSeconds) * 1000)
            : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // 預設 10 天

          await db.update(schema.youtubeChannels)
            .set({
              subscriptionStatus: 'subscribed',
              subscriptionExpiresAt: expiresAt,
              subscriptionError: null,
              updatedAt: new Date(),
            })
            .where(eq(schema.youtubeChannels.channelId, channelId))

          console.log(`[Webhook] Subscription confirmed for ${channelId}, expires at ${expiresAt}`)
        } else {
          await db.update(schema.youtubeChannels)
            .set({
              subscriptionStatus: 'expired',
              updatedAt: new Date(),
            })
            .where(eq(schema.youtubeChannels.channelId, channelId))

          console.log(`[Webhook] Unsubscription confirmed for ${channelId}`)
        }
      }

      // 回傳 challenge 確認訂閱
      return challenge
    }

    throw createError({
      statusCode: 400,
      message: 'Invalid verification request',
    })
  }

  // POST: 接收新影片通知
  if (event.method === 'POST') {
    const body = await readRawBody(event)

    if (!body) {
      throw createError({
        statusCode: 400,
        message: 'Empty body',
      })
    }

    // 解析 Atom Feed
    const feed = parseAtomFeed(body)
    if (!feed) {
      console.warn('[Webhook] Failed to parse feed')
      return { ok: true, skipped: true, reason: 'parse_failed' }
    }

    console.log(`[Webhook] Received notification for video ${feed.videoId} from channel ${feed.channelId}`)

    // 驗證簽名（如果有）
    const signature = event.headers.get('x-hub-signature')
    if (signature) {
      const channel = await db.query.youtubeChannels.findFirst({
        where: eq(schema.youtubeChannels.channelId, feed.channelId),
      })

      if (channel && !verifyHmacSignature(body, signature, channel.webhookSecret)) {
        console.warn(`[Webhook] Invalid signature for channel ${feed.channelId}`)
        throw createError({
          statusCode: 403,
          message: 'Invalid signature',
        })
      }
    }

    // 檢查頻道是否在我們的訂閱列表中
    const channel = await db.query.youtubeChannels.findFirst({
      where: eq(schema.youtubeChannels.channelId, feed.channelId),
    })

    if (!channel || !channel.isActive) {
      console.log(`[Webhook] Channel ${feed.channelId} not found or inactive, skipping`)
      return { ok: true, skipped: true, reason: 'channel_not_found' }
    }

    // 檢查影片是否已處理過（去重）
    const existing = await db.query.youtubeVideos.findFirst({
      where: eq(schema.youtubeVideos.videoId, feed.videoId),
    })

    if (existing) {
      console.log(`[Webhook] Video ${feed.videoId} already processed, skipping`)
      return { ok: true, skipped: true, reason: 'already_processed' }
    }

    // 建立影片記錄
    await db.insert(schema.youtubeVideos).values({
      id: nanoid(),
      videoId: feed.videoId,
      channelId: feed.channelId,
      title: feed.title,
      publishedAt: new Date(feed.publishedAt),
      processStatus: 'pending',
      discoverySource: 'pubsub',
      discoveredAt: new Date(),
    })

    // 觸發 Inngest 處理
    await inngest.send({
      name: 'youtube/video.new',
      data: {
        videoId: feed.videoId,
        channelId: feed.channelId,
        title: feed.title,
        publishedAt: feed.publishedAt,
        discoverySource: 'pubsub',
      },
    })

    console.log(`[Webhook] Triggered processing for video ${feed.videoId}`)

    return { ok: true, videoId: feed.videoId }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  })
})
