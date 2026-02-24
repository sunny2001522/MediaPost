import { eq, and, lt } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { subscribeToChannel } from '~/server/services/youtube/pubsub'

/**
 * 訂閱續訂 Cron Job
 *
 * 每 6 小時執行一次，檢查並續訂即將過期的 PubSubHubbub 訂閱
 */
export default defineEventHandler(async (event) => {
  // 驗證 Cron Secret
  const authHeader = event.headers.get('authorization')
  const config = useRuntimeConfig()

  if (config.cronSecret && authHeader !== `Bearer ${config.cronSecret}`) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const db = useDB()
  const results: Array<{ channelId: string; success: boolean; error?: string }> = []

  // 取得 7 天內即將過期的訂閱
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const expiringChannels = await db.query.youtubeChannels.findMany({
    where: and(
      eq(schema.youtubeChannels.isActive, true),
      eq(schema.youtubeChannels.subscriptionStatus, 'subscribed'),
      lt(schema.youtubeChannels.subscriptionExpiresAt, sevenDaysLater)
    ),
  })

  console.log(`[Cron Renewal] Found ${expiringChannels.length} channels needing renewal`)

  const baseUrl = config.public.baseUrl || `https://${event.headers.get('host')}`

  for (const channel of expiringChannels) {
    try {
      const result = await subscribeToChannel(
        channel.channelId,
        channel.webhookSecret,
        baseUrl
      )

      if (result.success) {
        console.log(`[Cron Renewal] Successfully renewed ${channel.channelId}`)
        results.push({ channelId: channel.channelId, success: true })
      } else {
        console.error(`[Cron Renewal] Failed to renew ${channel.channelId}:`, result.error)

        // 更新錯誤狀態
        await db.update(schema.youtubeChannels)
          .set({
            subscriptionError: result.error,
            updatedAt: new Date(),
          })
          .where(eq(schema.youtubeChannels.id, channel.id))

        results.push({ channelId: channel.channelId, success: false, error: result.error })
      }
    } catch (error: any) {
      console.error(`[Cron Renewal] Error renewing ${channel.channelId}:`, error)
      results.push({ channelId: channel.channelId, success: false, error: error.message })
    }
  }

  // 同時檢查失敗的訂閱，嘗試重新訂閱
  const failedChannels = await db.query.youtubeChannels.findMany({
    where: and(
      eq(schema.youtubeChannels.isActive, true),
      eq(schema.youtubeChannels.subscriptionStatus, 'failed')
    ),
  })

  console.log(`[Cron Renewal] Retrying ${failedChannels.length} failed subscriptions`)

  for (const channel of failedChannels) {
    try {
      const result = await subscribeToChannel(
        channel.channelId,
        channel.webhookSecret,
        baseUrl
      )

      if (result.success) {
        await db.update(schema.youtubeChannels)
          .set({
            subscriptionStatus: 'pending',
            subscriptionError: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.youtubeChannels.id, channel.id))

        console.log(`[Cron Renewal] Retry successful for ${channel.channelId}`)
        results.push({ channelId: channel.channelId, success: true })
      } else {
        results.push({ channelId: channel.channelId, success: false, error: result.error })
      }
    } catch (error: any) {
      results.push({ channelId: channel.channelId, success: false, error: error.message })
    }
  }

  const successCount = results.filter(r => r.success).length
  console.log(`[Cron Renewal] Completed. ${successCount}/${results.length} successful`)

  return {
    success: true,
    renewedCount: results.filter(r => r.success).length,
    failedCount: results.filter(r => !r.success).length,
    results,
  }
})
