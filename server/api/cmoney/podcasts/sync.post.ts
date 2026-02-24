import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'
import { fetchAllPodcastEpisodes } from '~/server/services/cmoney'
import { inngest } from '~/server/services/inngest'

/**
 * 手動同步 CMoney Podcast
 * POST /api/cmoney/podcasts/sync
 * body: {
 *   authorId: string,
 *   maxEpisodes?: number,
 *   titlePattern?: string,  // 只同步符合標題的集數，例如 "EP34[5-9]|EP35[0-2]"
 *   forceResync?: boolean   // 強制重新同步（忽略已處理的）
 * }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()

  const { authorId, maxEpisodes = 50, titlePattern, forceResync = false } = body

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

  console.log(`[CMoney Sync] Fetching podcasts for author ${author.name} (trackId: ${author.cmoneyPodcastTrackId})`)

  // 從 CMoney API 取得所有 Podcast
  const episodes = await fetchAllPodcastEpisodes(author.cmoneyPodcastTrackId, { maxEpisodes })

  console.log(`[CMoney Sync] Found ${episodes.length} episodes`)

  // 如果有指定標題模式，先過濾
  let filteredEpisodes = episodes
  if (titlePattern) {
    const regex = new RegExp(titlePattern, 'i')
    filteredEpisodes = episodes.filter(ep => regex.test(ep.title || ''))
    console.log(`[CMoney Sync] Filtered to ${filteredEpisodes.length} episodes matching "${titlePattern}"`)
  }

  // 過濾已處理的集數（除非強制重新同步）
  const newEpisodes: typeof episodes = []
  for (const episode of filteredEpisodes) {
    const existing = await db.query.cmoneyPodcastEpisodes.findFirst({
      where: eq(schema.cmoneyPodcastEpisodes.audioUrl, episode.audioUrl),
    })

    if (forceResync || !existing || existing.processStatus === 'failed') {
      newEpisodes.push(episode)
    }
  }

  console.log(`[CMoney Sync] ${newEpisodes.length} episodes to process (forceResync: ${forceResync})`)

  // 為每個新集數觸發 Inngest 事件
  const eventsToSend = newEpisodes.map((episode) => ({
    name: 'cmoney/podcast.new' as const,
    data: {
      audioUrl: episode.audioUrl,
      pubDate: episode.pubDate,
      title: episode.title || `${author.name} Podcast`,
      description: episode.description || undefined, // 傳遞節目描述
      trackId: author.cmoneyPodcastTrackId!,
      authorId: author.id,
      authorName: author.name,
      discoverySource: 'manual' as const,
    },
  }))

  if (eventsToSend.length > 0) {
    // 批量發送事件
    await inngest.send(eventsToSend)
  }

  return {
    success: true,
    totalEpisodes: episodes.length,
    newEpisodes: newEpisodes.length,
    message: `已將 ${newEpisodes.length} 個新集數加入處理佇列`,
  }
})
