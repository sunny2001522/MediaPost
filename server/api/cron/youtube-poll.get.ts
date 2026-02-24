import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { getChannelVideos } from '~/server/services/youtube/channel'
import { inngest } from '~/server/services/inngest'

/**
 * YouTube 頻道輪詢 Cron Job
 *
 * 每 30 分鐘執行一次，作為 PubSubHubbub 的備援機制
 * 確保不會漏掉任何新影片
 */
export default defineEventHandler(async (event) => {
  // 驗證 Cron Secret（Vercel Cron 會自動帶入）
  const authHeader = event.headers.get('authorization')
  const config = useRuntimeConfig()

  // 如果設定了 CRON_SECRET，驗證請求
  if (config.cronSecret && authHeader !== `Bearer ${config.cronSecret}`) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const db = useDB()
  const results: Array<{ channelId: string; newVideos: number; error?: string }> = []

  // 取得所有活躍的頻道
  const channels = await db.query.youtubeChannels.findMany({
    where: eq(schema.youtubeChannels.isActive, true),
  })

  console.log(`[Cron Poll] Checking ${channels.length} channels`)

  for (const channel of channels) {
    try {
      // 取得上次輪詢後的新影片
      const publishedAfter = channel.lastPolledAt || channel.createdAt
      const videos = await getChannelVideos(channel.channelId, publishedAfter, 5)

      let newVideosCount = 0

      for (const video of videos) {
        // 檢查是否已處理過
        const existing = await db.query.youtubeVideos.findFirst({
          where: eq(schema.youtubeVideos.videoId, video.videoId),
        })

        if (!existing) {
          // 新影片，建立記錄並觸發處理
          await db.insert(schema.youtubeVideos).values({
            id: nanoid(),
            videoId: video.videoId,
            channelId: channel.channelId,
            title: video.title,
            publishedAt: new Date(video.publishedAt),
            processStatus: 'pending',
            discoverySource: 'cron',
            discoveredAt: new Date(),
          })

          await inngest.send({
            name: 'youtube/video.new',
            data: {
              videoId: video.videoId,
              channelId: channel.channelId,
              title: video.title,
              publishedAt: video.publishedAt,
              discoverySource: 'cron',
            },
          })

          newVideosCount++
          console.log(`[Cron Poll] Found new video ${video.videoId} from ${channel.channelTitle}`)
        }
      }

      // 更新最後輪詢時間
      await db.update(schema.youtubeChannels)
        .set({
          lastPolledAt: new Date(),
          lastVideoPublishedAt: videos.length > 0 ? new Date(videos[0].publishedAt) : channel.lastVideoPublishedAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.youtubeChannels.id, channel.id))

      results.push({
        channelId: channel.channelId,
        newVideos: newVideosCount,
      })
    } catch (error: any) {
      console.error(`[Cron Poll] Error polling channel ${channel.channelId}:`, error)
      results.push({
        channelId: channel.channelId,
        newVideos: 0,
        error: error.message,
      })
    }
  }

  const totalNewVideos = results.reduce((sum, r) => sum + r.newVideos, 0)
  console.log(`[Cron Poll] Completed. Found ${totalNewVideos} new videos across ${channels.length} channels`)

  return {
    success: true,
    channelsPolled: channels.length,
    totalNewVideos,
    results,
  }
})
