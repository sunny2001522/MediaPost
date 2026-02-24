import { eq, and, inArray } from 'drizzle-orm'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'
import { inngest } from '~/server/services/inngest'

/**
 * 重試失敗的 CMoney Podcast 集數
 * POST /api/cmoney/podcasts/retry
 * body: { authorId: string, audioUrls?: string[], retryAll?: boolean }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()

  const { authorId, audioUrls, retryAll = false } = body

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

  if (!author.cmoneyPodcastTrackId) {
    throw createError({
      statusCode: 400,
      message: '此作者尚未設定 CMoney Podcast TrackId',
    })
  }

  // 找出要重試的集數
  let failedEpisodes
  if (retryAll) {
    // 重試所有失敗的
    failedEpisodes = await db
      .select()
      .from(schema.cmoneyPodcastEpisodes)
      .where(
        and(
          eq(schema.cmoneyPodcastEpisodes.trackId, author.cmoneyPodcastTrackId),
          eq(schema.cmoneyPodcastEpisodes.processStatus, 'failed')
        )
      )
  } else if (audioUrls && audioUrls.length > 0) {
    // 重試指定的集數
    failedEpisodes = await db
      .select()
      .from(schema.cmoneyPodcastEpisodes)
      .where(
        and(
          eq(schema.cmoneyPodcastEpisodes.trackId, author.cmoneyPodcastTrackId),
          inArray(schema.cmoneyPodcastEpisodes.audioUrl, audioUrls)
        )
      )
  } else {
    throw createError({
      statusCode: 400,
      message: '請指定 audioUrls 或設定 retryAll: true',
    })
  }

  if (failedEpisodes.length === 0) {
    return {
      success: true,
      retriedCount: 0,
      message: '沒有需要重試的集數',
    }
  }

  // 重置狀態為 pending
  for (const episode of failedEpisodes) {
    await db
      .update(schema.cmoneyPodcastEpisodes)
      .set({
        processStatus: 'pending',
        errorMessage: null,
      })
      .where(eq(schema.cmoneyPodcastEpisodes.id, episode.id))
  }

  // 觸發 Inngest 事件
  const eventsToSend = failedEpisodes.map((episode) => ({
    name: 'cmoney/podcast.new' as const,
    data: {
      audioUrl: episode.audioUrl,
      pubDate: parseInt(episode.pubDate),
      title: episode.title || `${author.name} Podcast`,
      trackId: author.cmoneyPodcastTrackId!,
      authorId: author.id,
      authorName: author.name,
      discoverySource: 'manual' as const,
    },
  }))

  await inngest.send(eventsToSend)

  return {
    success: true,
    retriedCount: failedEpisodes.length,
    message: `已將 ${failedEpisodes.length} 個集數加入重試佇列`,
  }
})
