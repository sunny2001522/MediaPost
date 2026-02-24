import { eq, desc } from 'drizzle-orm'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'
import { fetchAllPodcastEpisodes } from '~/server/services/cmoney'

/**
 * 取得 CMoney Podcast 集數列表
 * GET /api/cmoney/podcasts/episodes?authorId=xxx
 *
 * 返回：
 * - availableEpisodes: 從 CMoney API 取得的可用集數（含是否已同步）
 * - syncedEpisodes: 資料庫中已同步的集數狀態
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const authorId = query.authorId as string

  if (!authorId) {
    throw createError({
      statusCode: 400,
      message: '缺少 authorId',
    })
  }

  const db = useDB()

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

  // 從 CMoney API 取得所有集數
  const apiEpisodes = await fetchAllPodcastEpisodes(author.cmoneyPodcastTrackId, { maxEpisodes: 100 })

  // 從資料庫取得已同步的集數
  const syncedEpisodes = await db
    .select()
    .from(schema.cmoneyPodcastEpisodes)
    .where(eq(schema.cmoneyPodcastEpisodes.trackId, author.cmoneyPodcastTrackId))
    .orderBy(desc(schema.cmoneyPodcastEpisodes.discoveredAt))

  // 建立 audioUrl -> 狀態 的映射
  const syncedMap = new Map(
    syncedEpisodes.map(ep => [ep.audioUrl, ep])
  )

  // 合併資料：API 集數 + 同步狀態
  const episodes = apiEpisodes.map(ep => {
    const synced = syncedMap.get(ep.audioUrl)
    return {
      id: ep.id,
      title: ep.title,
      description: ep.description,
      pubDate: ep.pubDate,
      audioUrl: ep.audioUrl,
      duration: ep.seconds,
      // 同步狀態
      syncStatus: synced?.processStatus || 'not_synced',
      errorMessage: synced?.errorMessage || null,
      retryCount: synced?.retryCount || 0,
      podcastId: synced?.podcastId || null,
      syncedAt: synced?.processedAt || null,
    }
  })

  // 按 pubDate 降序排列（最新的在前）
  episodes.sort((a, b) => b.pubDate - a.pubDate)

  // 提取集數編號範圍（從標題中解析 EP 編號）
  const episodeNumbers = episodes
    .map(ep => {
      const match = ep.title?.match(/EP(\d+)/i)
      return match ? parseInt(match[1]) : null
    })
    .filter((n): n is number => n !== null)

  const minEpisode = episodeNumbers.length > 0 ? Math.min(...episodeNumbers) : null
  const maxEpisode = episodeNumbers.length > 0 ? Math.max(...episodeNumbers) : null

  return {
    episodes,
    summary: {
      total: episodes.length,
      synced: episodes.filter(e => e.syncStatus === 'completed').length,
      processing: episodes.filter(e => e.syncStatus === 'processing').length,
      failed: episodes.filter(e => e.syncStatus === 'failed').length,
      notSynced: episodes.filter(e => e.syncStatus === 'not_synced').length,
      episodeRange: minEpisode && maxEpisode ? { min: minEpisode, max: maxEpisode } : null,
    },
  }
})
