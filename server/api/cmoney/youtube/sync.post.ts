import { eq } from 'drizzle-orm'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'
import { fetchAllYoutubeVideos } from '~/server/services/cmoney'
import { inngest } from '~/server/services/inngest'

/**
 * 手動同步 CMoney YouTube 影片
 * POST /api/cmoney/youtube/sync
 * body: { authorId: string, maxVideos?: number }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()

  const { authorId, maxVideos = 50 } = body

  if (!authorId) {
    throw createError({
      statusCode: 400,
      message: '缺少 authorId',
    })
  }

  // 取得作者資料
  const [author] = await db
    .select()
    .from(schema.authors)
    .where(eq(schema.authors.id, authorId))
    .limit(1)

  if (!author) {
    throw createError({
      statusCode: 404,
      message: '找不到此作者',
    })
  }

  if (!author.cmoneyYoutubeChannelId) {
    throw createError({
      statusCode: 400,
      message: '此作者尚未設定 CMoney YouTube 頻道 ID',
    })
  }

  console.log(`[CMoney YouTube Sync] Fetching videos for author ${author.name} (channelId: ${author.cmoneyYoutubeChannelId})`)

  // 從 CMoney API 取得所有 YouTube 影片
  const videos = await fetchAllYoutubeVideos(author.cmoneyYoutubeChannelId, { maxVideos })

  console.log(`[CMoney YouTube Sync] Found ${videos.length} videos`)

  // 過濾已處理的影片
  const newVideos: typeof videos = []
  for (const video of videos) {
    const existing = await db.query.youtubeVideos.findFirst({
      where: eq(schema.youtubeVideos.videoId, video.youtubeVideoId),
    })

    if (!existing || existing.processStatus === 'failed') {
      newVideos.push(video)
    }
  }

  console.log(`[CMoney YouTube Sync] ${newVideos.length} new videos to process`)

  // 為每個新影片觸發 Inngest 事件
  const eventsToSend = newVideos.map((video) => ({
    name: 'cmoney/youtube.new' as const,
    data: {
      youtubeVideoId: video.youtubeVideoId,
      pubDate: video.pubDate,
      channelId: author.cmoneyYoutubeChannelId!,
      authorId: author.id,
      title: video.title || undefined,
      discoverySource: 'manual' as const,
    },
  }))

  if (eventsToSend.length > 0) {
    // 批量發送事件
    await inngest.send(eventsToSend)
  }

  return {
    success: true,
    totalVideos: videos.length,
    newVideos: newVideos.length,
    message: `已將 ${newVideos.length} 部新影片加入處理佇列`,
  }
})
