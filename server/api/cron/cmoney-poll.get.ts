import { eq, isNotNull, or } from 'drizzle-orm'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'
import { fetchPodcastPage } from '~/server/services/cmoney/podcast'
import { fetchYoutubeVideoPage } from '~/server/services/cmoney/youtube'
import { inngest } from '~/server/services/inngest'

/**
 * CMoney 定時輪詢任務
 * 輪詢所有設定了 CMoney ID 的作者，抓取新內容
 *
 * GET /api/cron/cmoney-poll
 * Cron: 每 4 小時執行一次
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // 驗證 CRON_SECRET
  const authHeader = getHeader(event, 'authorization')
  if (authHeader !== `Bearer ${config.cronSecret}`) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const db = useDB()
  const results = {
    podcastsProcessed: 0,
    podcastsNew: 0,
    videosProcessed: 0,
    videosNew: 0,
    errors: [] as string[],
  }

  // 取得所有有設定 CMoney ID 的作者
  const authors = await db
    .select()
    .from(schema.authors)
    .where(
      or(
        isNotNull(schema.authors.cmoneyPodcastTrackId),
        isNotNull(schema.authors.cmoneyYoutubeChannelId)
      )
    )

  console.log(`[CMoney Cron] Found ${authors.length} authors with CMoney IDs`)

  for (const author of authors) {
    // 處理 Podcast
    if (author.cmoneyPodcastTrackId) {
      try {
        console.log(`[CMoney Cron] Polling podcasts for ${author.name}`)

        // 只取最新一頁
        const episodes = await fetchPodcastPage(author.cmoneyPodcastTrackId)
        results.podcastsProcessed += episodes.length

        // 檢查新集數
        const eventsToSend: Array<{
          name: 'cmoney/podcast.new'
          data: {
            audioUrl: string
            pubDate: number
            title: string
            description?: string
            trackId: string
            authorId: string
            authorName: string
            discoverySource: 'cron'
          }
        }> = []

        for (const episode of episodes) {
          const existing = await db.query.cmoneyPodcastEpisodes.findFirst({
            where: eq(schema.cmoneyPodcastEpisodes.audioUrl, episode.audioUrl),
          })

          if (!existing) {
            eventsToSend.push({
              name: 'cmoney/podcast.new',
              data: {
                audioUrl: episode.audioUrl,
                pubDate: episode.pubDate,
                title: episode.title || `${author.name} Podcast`,
                description: episode.description || undefined,
                trackId: author.cmoneyPodcastTrackId!,
                authorId: author.id,
                authorName: author.name,
                discoverySource: 'cron',
              },
            })
          }
        }

        if (eventsToSend.length > 0) {
          await inngest.send(eventsToSend)
          results.podcastsNew += eventsToSend.length
          console.log(`[CMoney Cron] Found ${eventsToSend.length} new podcasts for ${author.name}`)
        }
      } catch (error: any) {
        console.error(`[CMoney Cron] Error polling podcasts for ${author.name}:`, error)
        results.errors.push(`Podcast ${author.name}: ${error.message}`)
      }
    }

    // 處理 YouTube
    if (author.cmoneyYoutubeChannelId) {
      try {
        console.log(`[CMoney Cron] Polling YouTube for ${author.name}`)

        // 只取最新一頁
        const videos = await fetchYoutubeVideoPage(author.cmoneyYoutubeChannelId)
        results.videosProcessed += videos.length

        // 檢查新影片
        const eventsToSend: Array<{
          name: 'cmoney/youtube.new'
          data: {
            youtubeVideoId: string
            pubDate: string
            channelId: string
            authorId: string
            title?: string
            discoverySource: 'cron'
          }
        }> = []

        for (const video of videos) {
          const existing = await db.query.youtubeVideos.findFirst({
            where: eq(schema.youtubeVideos.videoId, video.youtubeVideoId),
          })

          if (!existing) {
            eventsToSend.push({
              name: 'cmoney/youtube.new',
              data: {
                youtubeVideoId: video.youtubeVideoId,
                pubDate: String(video.pubDate),
                channelId: author.cmoneyYoutubeChannelId!,
                authorId: author.id,
                title: video.title || undefined,
                discoverySource: 'cron',
              },
            })
          }
        }

        if (eventsToSend.length > 0) {
          await inngest.send(eventsToSend)
          results.videosNew += eventsToSend.length
          console.log(`[CMoney Cron] Found ${eventsToSend.length} new videos for ${author.name}`)
        }
      } catch (error: any) {
        console.error(`[CMoney Cron] Error polling YouTube for ${author.name}:`, error)
        results.errors.push(`YouTube ${author.name}: ${error.message}`)
      }
    }
  }

  console.log('[CMoney Cron] Poll completed:', results)

  return {
    success: true,
    ...results,
  }
})
