import { inngest } from '~/server/services/inngest'

/**
 * 測試用：手動觸發處理 YouTube 影片
 *
 * Body: {
 *   videoId: string      // YouTube Video ID
 *   channelId?: string   // Channel ID（可選）
 *   title?: string       // 標題（可選）
 * }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.videoId) {
    throw createError({
      statusCode: 400,
      message: 'videoId is required',
    })
  }

  // 發送 Inngest 事件
  await inngest.send({
    name: 'youtube/video.new',
    data: {
      videoId: body.videoId,
      channelId: body.channelId || 'manual-test',
      title: body.title || 'Test Video',
      publishedAt: new Date().toISOString(),
      discoverySource: 'manual',
    },
  })

  return {
    success: true,
    message: `Triggered processing for video ${body.videoId}`,
    checkAt: 'http://localhost:8288 to see the execution',
  }
})
