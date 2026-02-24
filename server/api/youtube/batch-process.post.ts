import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { getChannelVideos } from '~/server/services/youtube/channel'
import { inngest } from '~/server/services/inngest'

/**
 * 批次爬取 YouTube 頻道的歷史影片
 *
 * Body: {
 *   channelId: string    // YouTube Channel ID
 *   mode: 'past' | 'future'
 *   pastDays?: number    // 爬取過去幾天的影片
 *   maxVideos?: number   // 最多處理幾部影片
 * }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()

  if (!body.channelId) {
    throw createError({
      statusCode: 400,
      message: 'channelId is required',
    })
  }

  // 取得頻道資訊
  const channel = await db.query.youtubeChannels.findFirst({
    where: eq(schema.youtubeChannels.channelId, body.channelId),
  })

  if (!channel) {
    throw createError({
      statusCode: 404,
      message: 'Channel not found',
    })
  }

  // 如果只監控未來，不需要爬取
  if (body.mode === 'future') {
    return {
      success: true,
      mode: 'future',
      message: 'Channel will be monitored for new videos',
    }
  }

  // 計算時間範圍
  const pastDays = body.pastDays || 30
  const maxVideos = body.maxVideos || 10
  const publishedAfter = new Date(Date.now() - pastDays * 24 * 60 * 60 * 1000)

  console.log(`[Batch] Fetching videos from ${channel.channelTitle} since ${publishedAfter.toISOString()}`)

  // 取得頻道影片
  const videos = await getChannelVideos(body.channelId, publishedAfter, maxVideos)

  if (videos.length === 0) {
    return {
      success: true,
      videosFound: 0,
      videosQueued: 0,
      message: 'No videos found in the specified time range',
    }
  }

  console.log(`[Batch] Found ${videos.length} videos`)

  // 過濾已處理的影片
  const newVideos: typeof videos = []
  for (const video of videos) {
    const existing = await db.query.youtubeVideos.findFirst({
      where: eq(schema.youtubeVideos.videoId, video.videoId),
    })
    if (!existing) {
      newVideos.push(video)
    }
  }

  console.log(`[Batch] ${newVideos.length} new videos to process`)

  // 建立影片記錄並觸發處理
  const queuedVideos: string[] = []
  for (const video of newVideos) {
    // 建立 youtube_videos 記錄
    await db.insert(schema.youtubeVideos).values({
      id: nanoid(),
      videoId: video.videoId,
      channelId: body.channelId,
      title: video.title,
      publishedAt: new Date(video.publishedAt),
      processStatus: 'pending',
      discoverySource: 'manual',
      discoveredAt: new Date(),
    })

    // 觸發 Inngest 處理
    await inngest.send({
      name: 'youtube/video.new',
      data: {
        videoId: video.videoId,
        channelId: body.channelId,
        title: video.title,
        publishedAt: video.publishedAt,
        discoverySource: 'manual',
      },
    })

    queuedVideos.push(video.videoId)
  }

  return {
    success: true,
    videosFound: videos.length,
    videosQueued: queuedVideos.length,
    videosSkipped: videos.length - queuedVideos.length,
    queuedVideoIds: queuedVideos,
  }
})
