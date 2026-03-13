import { nanoid } from 'nanoid'
import { eq, and, lt, isNotNull, or } from 'drizzle-orm'
import { inngest } from './client'
import { useDB, schema } from '~/server/database/client'
import { generatePost } from '~/server/services/openai'
import { getYouTubeVideoInfo, extractMarketingSummary } from '~/server/services/youtube'
import { getChannelVideos } from '~/server/services/youtube/channel'
import { subscribeToChannel } from '~/server/services/youtube/pubsub'
import { downloadYouTubeAudio, cleanupYouTubeAudio } from '~/server/services/audio/youtube'
import { downloadCMoneyAudio, cleanupCMoneyAudio } from '~/server/services/audio/cmoney'
import { transcribeFromPath } from '~/server/services/audio'
import { fetchPodcastPage } from '~/server/services/cmoney/podcast'
import { fetchYoutubeVideoPage } from '~/server/services/cmoney/youtube'
import { fetchInvestmentNotes, getArticleUrl } from '~/server/services/cmoney/investmentNotes'
import { getValidThreadsToken } from '~/server/services/threads/auth'
import { publishToThreads } from '~/server/services/publish/meta'
import { getAuthorPersona } from '~/server/services/openai'

/**
 * 處理新 YouTube 影片
 * 分為多個步驟，每個步驟獨立執行，繞過 Vercel 60 秒限制
 */
export const processYouTubeVideo = inngest.createFunction(
  {
    id: 'process-youtube-video',
    retries: 3,
    onFailure: async ({ error, event }) => {
      console.error('[Inngest] processYouTubeVideo failed:', error)
      const db = useDB()
      const videoId = (event.data as any).videoId as string

      if (videoId) {
        // 更新影片狀態為失敗
        await db.update(schema.youtubeVideos)
          .set({
            processStatus: 'failed',
            errorMessage: error.message,
            retryCount: ((event.data as any).retryCount || 0) + 1,
          })
          .where(eq(schema.youtubeVideos.videoId, videoId))
      }
    },
  },
  { event: 'youtube/video.new' },
  async ({ event, step }) => {
    const { videoId, channelId, title, discoverySource, publishedAt } = event.data
    const db = useDB()

    // Step 1: 驗證並建立記錄
    const podcast = await step.run('create-podcast', async () => {
      // 檢查影片是否已處理過
      const existing = await db.query.youtubeVideos.findFirst({
        where: eq(schema.youtubeVideos.videoId, videoId),
      })

      if (existing && existing.processStatus === 'completed') {
        console.log(`[Inngest] Video ${videoId} already processed, skipping`)
        return null
      }

      // 取得頻道資訊
      const channel = await db.query.youtubeChannels.findFirst({
        where: eq(schema.youtubeChannels.channelId, channelId),
      })

      // 建立 podcast 記錄
      const podcastId = nanoid()
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
      const now = new Date()

      await db.insert(schema.podcasts).values({
        id: podcastId,
        title: title || 'Untitled',
        authorId: channel?.authorId || null,
        sourceType: 'youtube',
        sourceUrl: youtubeUrl,
        status: 'downloading',
        createdAt: now,
        updatedAt: now,
      })

      // 更新 youtube_videos 記錄
      if (existing) {
        await db.update(schema.youtubeVideos)
          .set({
            podcastId,
            processStatus: 'processing',
          })
          .where(eq(schema.youtubeVideos.videoId, videoId))
      } else {
        await db.insert(schema.youtubeVideos).values({
          id: nanoid(),
          videoId,
          channelId,
          title,
          podcastId,
          processStatus: 'processing',
          discoverySource,
          discoveredAt: now,
        })
      }

      console.log(`[Inngest] Created podcast ${podcastId} for video ${videoId}`)
      return {
        podcastId,
        youtubeUrl,
        authorId: channel?.authorId || null,
      }
    })

    // 如果已處理過，直接返回
    if (!podcast) {
      return { skipped: true, videoId }
    }

    // Step 2: 取得 YouTube 描述（不需要音檔）
    const description = await step.run('fetch-description', async () => {
      console.log(`[Inngest] Fetching description for ${videoId}`)

      const videoInfo = await getYouTubeVideoInfo(podcast.youtubeUrl)
      if (!videoInfo) return null

      // 取得作者名稱
      let authorName: string | undefined
      if (podcast.authorId) {
        const author = await db.query.authors.findFirst({
          where: eq(schema.authors.id, podcast.authorId),
        })
        authorName = author?.name
      }

      const summary = extractMarketingSummary(videoInfo.description, authorName)

      // 保存描述
      if (summary) {
        await db.update(schema.podcasts)
          .set({ youtubeDescription: summary })
          .where(eq(schema.podcasts.id, podcast.podcastId))
      }

      return summary
    })

    // Step 3: 下載、轉錄、清理（在同一個 step 內完成）
    const transcript = await step.run('download-transcribe-cleanup', async () => {
      console.log(`[Inngest] Downloading and transcribing audio for ${videoId}`)

      // 更新狀態
      await db.update(schema.podcasts)
        .set({ status: 'transcribing', updatedAt: new Date() })
        .where(eq(schema.podcasts.id, podcast.podcastId))

      // 下載音檔
      const { localPath } = await downloadYouTubeAudio(podcast.youtubeUrl)

      try {
        // 轉錄
        const result = await transcribeFromPath(localPath)

        // 保存轉錄結果
        await db.update(schema.podcasts)
          .set({
            transcript: result.transcript,
            duration: result.duration,
            status: 'generating',
            updatedAt: new Date(),
          })
          .where(eq(schema.podcasts.id, podcast.podcastId))

        return result.transcript
      } finally {
        // 轉錄完成後立即清理音檔
        console.log(`[Inngest] Cleaning up audio file for ${videoId}`)
        await cleanupYouTubeAudio(localPath)
      }
    })

    // Step 5: 生成貼文
    const generation = await step.run('generate-posts', async () => {
      console.log(`[Inngest] Generating posts for ${videoId}`)

      const { content, tokenCount, generationTimeMs } = await generatePost(
        transcript,
        title,
        undefined,
        undefined,
        undefined,
        5,
        [],
        description || undefined,
        podcast.authorId,
        undefined,
        publishedAt // 傳入發布日期
      )

      // 保存生成結果
      const generationId = nanoid()
      await db.insert(schema.generations).values({
        id: generationId,
        podcastId: podcast.podcastId,
        originalContent: content,
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        tokenCount,
        generationTimeMs,
        createdAt: new Date(),
      })

      return { generationId }
    })

    // Step 5: 完成
    await step.run('complete', async () => {
      console.log(`[Inngest] Completing for ${videoId}`)

      // 更新狀態為完成
      await db.update(schema.podcasts)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(schema.podcasts.id, podcast.podcastId))

      // 更新影片記錄
      await db.update(schema.youtubeVideos)
        .set({
          processStatus: 'completed',
          processedAt: new Date(),
        })
        .where(eq(schema.youtubeVideos.videoId, videoId))

      // 更新頻道統計
      await db.update(schema.youtubeChannels)
        .set({
          totalVideosProcessed: (await db.query.youtubeChannels.findFirst({
            where: eq(schema.youtubeChannels.channelId, channelId),
          }))?.totalVideosProcessed || 0 + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.youtubeChannels.channelId, channelId))
    })

    console.log(`[Inngest] Completed processing video ${videoId}`)

    return {
      success: true,
      videoId,
      podcastId: podcast.podcastId,
      generationId: generation.generationId,
    }
  }
)

/**
 * 處理 CMoney Podcast
 * 直接下載音檔、轉錄、生成貼文
 */
export const processCMoneyPodcast = inngest.createFunction(
  {
    id: 'process-cmoney-podcast',
    retries: 3,
    onFailure: async ({ error, event }) => {
      console.error('[Inngest] processCMoneyPodcast failed:', error)
      const db = useDB()
      const audioUrl = (event.data as any).audioUrl as string

      if (audioUrl) {
        // 更新集數狀態為失敗
        await db.update(schema.cmoneyPodcastEpisodes)
          .set({
            processStatus: 'failed',
            errorMessage: error.message,
            retryCount: ((event.data as any).retryCount || 0) + 1,
          })
          .where(eq(schema.cmoneyPodcastEpisodes.audioUrl, audioUrl))
      }
    },
  },
  { event: 'cmoney/podcast.new' },
  async ({ event, step }) => {
    const { audioUrl, pubDate, title: episodeTitle, description, trackId, authorId, authorName, discoverySource } = event.data
    const db = useDB()

    // Step 1: 驗證並建立記錄
    const podcast = await step.run('create-podcast', async () => {
      // 檢查是否已處理過
      const existing = await db.query.cmoneyPodcastEpisodes.findFirst({
        where: eq(schema.cmoneyPodcastEpisodes.audioUrl, audioUrl),
      })

      if (existing && existing.processStatus === 'completed') {
        console.log(`[Inngest] CMoney podcast ${audioUrl} already processed, skipping`)
        return null
      }

      // 建立 podcast 記錄
      const podcastId = nanoid()
      const now = new Date()

      // 使用 API 提供的標題，或從 pubDate 生成
      const title = episodeTitle || `${authorName} - ${new Date(pubDate * 1000).toLocaleDateString('zh-TW')}`

      await db.insert(schema.podcasts).values({
        id: podcastId,
        title,
        authorId,
        sourceType: 'cmoney',
        sourceUrl: audioUrl,
        youtubeDescription: description || null, // 保存節目描述
        status: 'downloading',
        createdAt: now,
        updatedAt: now,
      })

      // 更新或建立 cmoney_podcast_episodes 記錄
      if (existing) {
        await db.update(schema.cmoneyPodcastEpisodes)
          .set({
            podcastId,
            processStatus: 'processing',
          })
          .where(eq(schema.cmoneyPodcastEpisodes.audioUrl, audioUrl))
      } else {
        await db.insert(schema.cmoneyPodcastEpisodes).values({
          id: nanoid(),
          audioUrl,
          pubDate: String(pubDate), // 轉為字串儲存
          trackId,
          title,
          podcastId,
          processStatus: 'processing',
          discoverySource,
          discoveredAt: now,
        })
      }

      console.log(`[Inngest] Created podcast ${podcastId} for CMoney podcast ${audioUrl}`)
      return {
        podcastId,
        title,
        authorId,
      }
    })

    // 如果已處理過，直接返回
    if (!podcast) {
      return { skipped: true, audioUrl }
    }

    // Step 2: 下載、轉錄、清理（在同一個 step 內完成）
    const transcript = await step.run('download-transcribe-cleanup', async () => {
      console.log(`[Inngest] Downloading and transcribing CMoney audio: ${audioUrl}`)

      // 更新狀態
      await db.update(schema.podcasts)
        .set({ status: 'transcribing', updatedAt: new Date() })
        .where(eq(schema.podcasts.id, podcast.podcastId))

      // 下載音檔
      const { localPath } = await downloadCMoneyAudio(audioUrl)

      try {
        // 轉錄
        const result = await transcribeFromPath(localPath)

        // 保存轉錄結果
        await db.update(schema.podcasts)
          .set({
            transcript: result.transcript,
            duration: result.duration,
            status: 'generating',
            updatedAt: new Date(),
          })
          .where(eq(schema.podcasts.id, podcast.podcastId))

        return result.transcript
      } finally {
        // 轉錄完成後立即清理音檔
        console.log(`[Inngest] Cleaning up CMoney audio file`)
        await cleanupCMoneyAudio(localPath)
      }
    })

    // Step 4: 生成貼文
    const generation = await step.run('generate-posts', async () => {
      console.log(`[Inngest] Generating posts for CMoney podcast`)

      const { content, tokenCount, generationTimeMs } = await generatePost(
        transcript,
        podcast.title,
        undefined,
        undefined,
        authorName,
        5,
        [],
        undefined,
        authorId,
        undefined,
        pubDate // 傳入發布日期（Unix timestamp）
      )

      // 保存生成結果
      const generationId = nanoid()
      await db.insert(schema.generations).values({
        id: generationId,
        podcastId: podcast.podcastId,
        originalContent: content,
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        tokenCount,
        generationTimeMs,
        createdAt: new Date(),
      })

      return { generationId }
    })

    // Step 4: 完成
    await step.run('complete', async () => {
      console.log(`[Inngest] Completing CMoney podcast`)

      // 更新狀態為完成
      await db.update(schema.podcasts)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(schema.podcasts.id, podcast.podcastId))

      // 更新集數記錄
      await db.update(schema.cmoneyPodcastEpisodes)
        .set({
          processStatus: 'completed',
          processedAt: new Date(),
        })
        .where(eq(schema.cmoneyPodcastEpisodes.audioUrl, audioUrl))
    })

    console.log(`[Inngest] Completed processing CMoney podcast ${audioUrl}`)

    return {
      success: true,
      audioUrl,
      podcastId: podcast.podcastId,
      generationId: generation.generationId,
    }
  }
)

/**
 * 處理 CMoney YouTube 影片
 * 複用現有的 YouTube 處理流程（因為最終都是 YouTube URL）
 */
export const processCMoneyYoutube = inngest.createFunction(
  {
    id: 'process-cmoney-youtube',
    retries: 3,
    onFailure: async ({ error, event }) => {
      console.error('[Inngest] processCMoneyYoutube failed:', error)
      const db = useDB()
      const videoId = (event.data as any).youtubeVideoId as string

      if (videoId) {
        // 更新影片狀態為失敗
        await db.update(schema.youtubeVideos)
          .set({
            processStatus: 'failed',
            errorMessage: error.message,
            retryCount: ((event.data as any).retryCount || 0) + 1,
          })
          .where(eq(schema.youtubeVideos.videoId, videoId))
      }
    },
  },
  { event: 'cmoney/youtube.new' },
  async ({ event, step }) => {
    const { youtubeVideoId, channelId, authorId, title, discoverySource, pubDate } = event.data
    const db = useDB()
    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`

    // Step 1: 驗證並建立記錄
    const podcast = await step.run('create-podcast', async () => {
      // 檢查影片是否已處理過
      const existing = await db.query.youtubeVideos.findFirst({
        where: eq(schema.youtubeVideos.videoId, youtubeVideoId),
      })

      if (existing && existing.processStatus === 'completed') {
        console.log(`[Inngest] Video ${youtubeVideoId} already processed, skipping`)
        return null
      }

      // 建立 podcast 記錄
      const podcastId = nanoid()
      const now = new Date()

      await db.insert(schema.podcasts).values({
        id: podcastId,
        title: title || 'Untitled',
        authorId,
        sourceType: 'youtube',
        sourceUrl: youtubeUrl,
        status: 'downloading',
        createdAt: now,
        updatedAt: now,
      })

      // 更新或建立 youtube_videos 記錄
      if (existing) {
        await db.update(schema.youtubeVideos)
          .set({
            podcastId,
            processStatus: 'processing',
          })
          .where(eq(schema.youtubeVideos.videoId, youtubeVideoId))
      } else {
        await db.insert(schema.youtubeVideos).values({
          id: nanoid(),
          videoId: youtubeVideoId,
          channelId,
          title,
          podcastId,
          processStatus: 'processing',
          discoverySource,
          discoveredAt: now,
        })
      }

      console.log(`[Inngest] Created podcast ${podcastId} for CMoney YouTube video ${youtubeVideoId}`)
      return {
        podcastId,
        youtubeUrl,
        authorId,
      }
    })

    // 如果已處理過，直接返回
    if (!podcast) {
      return { skipped: true, youtubeVideoId }
    }

    // Step 2: 取得 YouTube 描述（不需要音檔）
    const description = await step.run('fetch-description', async () => {
      console.log(`[Inngest] Fetching description for ${youtubeVideoId}`)

      const videoInfo = await getYouTubeVideoInfo(podcast.youtubeUrl)
      if (!videoInfo) return null

      // 取得作者名稱
      let authorName: string | undefined
      if (podcast.authorId) {
        const author = await db.query.authors.findFirst({
          where: eq(schema.authors.id, podcast.authorId),
        })
        authorName = author?.name
      }

      const summary = extractMarketingSummary(videoInfo.description, authorName)

      // 保存描述
      if (summary) {
        await db.update(schema.podcasts)
          .set({ youtubeDescription: summary })
          .where(eq(schema.podcasts.id, podcast.podcastId))
      }

      return summary
    })

    // Step 3: 下載、轉錄、清理（在同一個 step 內完成）
    const transcript = await step.run('download-transcribe-cleanup', async () => {
      console.log(`[Inngest] Downloading and transcribing audio for ${youtubeVideoId}`)

      // 更新狀態
      await db.update(schema.podcasts)
        .set({ status: 'transcribing', updatedAt: new Date() })
        .where(eq(schema.podcasts.id, podcast.podcastId))

      // 下載音檔
      const { localPath } = await downloadYouTubeAudio(podcast.youtubeUrl)

      try {
        // 轉錄
        const result = await transcribeFromPath(localPath)

        // 保存轉錄結果
        await db.update(schema.podcasts)
          .set({
            transcript: result.transcript,
            duration: result.duration,
            status: 'generating',
            updatedAt: new Date(),
          })
          .where(eq(schema.podcasts.id, podcast.podcastId))

        return result.transcript
      } finally {
        // 轉錄完成後立即清理音檔
        console.log(`[Inngest] Cleaning up audio file for ${youtubeVideoId}`)
        await cleanupYouTubeAudio(localPath)
      }
    })

    // Step 4: 生成貼文
    const generation = await step.run('generate-posts', async () => {
      console.log(`[Inngest] Generating posts for ${youtubeVideoId}`)

      const { content, tokenCount, generationTimeMs } = await generatePost(
        transcript,
        title || 'Untitled',
        undefined,
        undefined,
        undefined,
        5,
        [],
        description || undefined,
        podcast.authorId,
        undefined,
        pubDate // 傳入發布日期
      )

      // 保存生成結果
      const generationId = nanoid()
      await db.insert(schema.generations).values({
        id: generationId,
        podcastId: podcast.podcastId,
        originalContent: content,
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        tokenCount,
        generationTimeMs,
        createdAt: new Date(),
      })

      return { generationId }
    })

    // Step 5: 完成
    await step.run('complete', async () => {
      console.log(`[Inngest] Completing for ${youtubeVideoId}`)

      // 更新狀態為完成
      await db.update(schema.podcasts)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(schema.podcasts.id, podcast.podcastId))

      // 更新影片記錄
      await db.update(schema.youtubeVideos)
        .set({
          processStatus: 'completed',
          processedAt: new Date(),
        })
        .where(eq(schema.youtubeVideos.videoId, youtubeVideoId))
    })

    console.log(`[Inngest] Completed processing CMoney YouTube video ${youtubeVideoId}`)

    return {
      success: true,
      youtubeVideoId,
      podcastId: podcast.podcastId,
      generationId: generation.generationId,
    }
  }
)

/**
 * YouTube 頻道輪詢 Cron Job
 * 每 30 分鐘執行一次，作為 PubSubHubbub 的備援機制
 */
export const youtubePollingCron = inngest.createFunction(
  { id: 'youtube-polling-cron' },
  { cron: '*/30 * * * *' },
  async ({ step }) => {
    const db = useDB()
    const results: Array<{ channelId: string; newVideos: number; error?: string }> = []

    // 取得所有活躍的頻道
    const channels = await step.run('get-active-channels', async () => {
      return await db.query.youtubeChannels.findMany({
        where: eq(schema.youtubeChannels.isActive, true),
      })
    })

    console.log(`[Inngest Cron] YouTube Poll: Checking ${channels.length} channels`)

    for (const channel of channels) {
      const result = await step.run(`poll-channel-${channel.channelId}`, async () => {
        try {
          // 取得上次輪詢後的新影片
          const lastTime = channel.lastPolledAt || channel.createdAt
          const publishedAfter = lastTime ? new Date(lastTime) : undefined
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
              console.log(`[Inngest Cron] Found new video ${video.videoId} from ${channel.channelTitle}`)
            }
          }

          // 更新最後輪詢時間
          await db.update(schema.youtubeChannels)
            .set({
              lastPolledAt: new Date(),
              lastVideoPublishedAt: videos.length > 0 ? new Date(videos[0].publishedAt) : (channel.lastVideoPublishedAt ? new Date(channel.lastVideoPublishedAt) : null),
              updatedAt: new Date(),
            })
            .where(eq(schema.youtubeChannels.id, channel.id))

          return { channelId: channel.channelId, newVideos: newVideosCount }
        } catch (error: any) {
          console.error(`[Inngest Cron] Error polling channel ${channel.channelId}:`, error)
          return { channelId: channel.channelId, newVideos: 0, error: error.message }
        }
      })

      results.push(result)
    }

    const totalNewVideos = results.reduce((sum, r) => sum + r.newVideos, 0)
    console.log(`[Inngest Cron] YouTube Poll completed. Found ${totalNewVideos} new videos across ${channels.length} channels`)

    return {
      success: true,
      channelsPolled: channels.length,
      totalNewVideos,
      results,
    }
  }
)

/**
 * 訂閱續訂 Cron Job
 * 每 6 小時執行一次，檢查並續訂即將過期的 PubSubHubbub 訂閱
 */
export const subscriptionRenewalCron = inngest.createFunction(
  { id: 'subscription-renewal-cron' },
  { cron: '0 */6 * * *' },
  async ({ step }) => {
    const db = useDB()
    const results: Array<{ channelId: string; success: boolean; error?: string }> = []

    // 取得 7 天內即將過期的訂閱
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const expiringChannels = await step.run('get-expiring-channels', async () => {
      return await db.query.youtubeChannels.findMany({
        where: and(
          eq(schema.youtubeChannels.isActive, true),
          eq(schema.youtubeChannels.subscriptionStatus, 'subscribed'),
          lt(schema.youtubeChannels.subscriptionExpiresAt, sevenDaysLater)
        ),
      })
    })

    console.log(`[Inngest Cron] Subscription Renewal: Found ${expiringChannels.length} channels needing renewal`)

    const config = useRuntimeConfig()
    const baseUrl = config.public.baseUrl

    for (const channel of expiringChannels) {
      const result = await step.run(`renew-${channel.channelId}`, async () => {
        try {
          const renewResult = await subscribeToChannel(
            channel.channelId,
            channel.webhookSecret,
            baseUrl
          )

          if (renewResult.success) {
            console.log(`[Inngest Cron] Successfully renewed ${channel.channelId}`)
            return { channelId: channel.channelId, success: true }
          } else {
            console.error(`[Inngest Cron] Failed to renew ${channel.channelId}:`, renewResult.error)

            // 更新錯誤狀態
            await db.update(schema.youtubeChannels)
              .set({
                subscriptionError: renewResult.error,
                updatedAt: new Date(),
              })
              .where(eq(schema.youtubeChannels.id, channel.id))

            return { channelId: channel.channelId, success: false, error: renewResult.error }
          }
        } catch (error: any) {
          console.error(`[Inngest Cron] Error renewing ${channel.channelId}:`, error)
          return { channelId: channel.channelId, success: false, error: error.message }
        }
      })

      results.push(result)
    }

    // 同時檢查失敗的訂閱，嘗試重新訂閱
    const failedChannels = await step.run('get-failed-channels', async () => {
      return await db.query.youtubeChannels.findMany({
        where: and(
          eq(schema.youtubeChannels.isActive, true),
          eq(schema.youtubeChannels.subscriptionStatus, 'failed')
        ),
      })
    })

    console.log(`[Inngest Cron] Retrying ${failedChannels.length} failed subscriptions`)

    for (const channel of failedChannels) {
      const result = await step.run(`retry-${channel.channelId}`, async () => {
        try {
          const retryResult = await subscribeToChannel(
            channel.channelId,
            channel.webhookSecret,
            baseUrl
          )

          if (retryResult.success) {
            await db.update(schema.youtubeChannels)
              .set({
                subscriptionStatus: 'pending',
                subscriptionError: null,
                updatedAt: new Date(),
              })
              .where(eq(schema.youtubeChannels.id, channel.id))

            console.log(`[Inngest Cron] Retry successful for ${channel.channelId}`)
            return { channelId: channel.channelId, success: true }
          } else {
            return { channelId: channel.channelId, success: false, error: retryResult.error }
          }
        } catch (error: any) {
          return { channelId: channel.channelId, success: false, error: error.message }
        }
      })

      results.push(result)
    }

    const successCount = results.filter(r => r.success).length
    console.log(`[Inngest Cron] Subscription Renewal completed. ${successCount}/${results.length} successful`)

    return {
      success: true,
      renewedCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      results,
    }
  }
)

/**
 * CMoney 定時輪詢任務
 * 每 4 小時執行一次，輪詢所有設定了 CMoney ID 的作者
 */
export const cmoneyPollingCron = inngest.createFunction(
  { id: 'cmoney-polling-cron' },
  { cron: '0 */4 * * *' },
  async ({ step }) => {
    const db = useDB()
    const results = {
      podcastsProcessed: 0,
      podcastsNew: 0,
      videosProcessed: 0,
      videosNew: 0,
      errors: [] as string[],
    }

    // 取得所有有設定 CMoney ID 的作者
    const authors = await step.run('get-authors', async () => {
      return await db
        .select()
        .from(schema.authors)
        .where(
          or(
            isNotNull(schema.authors.cmoneyPodcastTrackId),
            isNotNull(schema.authors.cmoneyYoutubeChannelId)
          )
        )
    })

    console.log(`[Inngest Cron] CMoney Poll: Found ${authors.length} authors with CMoney IDs`)

    for (const author of authors) {
      // 處理 Podcast
      if (author.cmoneyPodcastTrackId) {
        const podcastResult = await step.run(`podcast-${author.id}`, async () => {
          try {
            console.log(`[Inngest Cron] Polling podcasts for ${author.name}`)

            // 只取最新一頁
            const episodes = await fetchPodcastPage(author.cmoneyPodcastTrackId!)
            let newCount = 0

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
              newCount = eventsToSend.length
              console.log(`[Inngest Cron] Found ${eventsToSend.length} new podcasts for ${author.name}`)
            }

            return { processed: episodes.length, new: newCount }
          } catch (error: any) {
            console.error(`[Inngest Cron] Error polling podcasts for ${author.name}:`, error)
            return { processed: 0, new: 0, error: `Podcast ${author.name}: ${error.message}` }
          }
        })

        results.podcastsProcessed += podcastResult.processed
        results.podcastsNew += podcastResult.new
        if ('error' in podcastResult && podcastResult.error) results.errors.push(podcastResult.error)
      }

      // 處理 YouTube
      if (author.cmoneyYoutubeChannelId) {
        const youtubeResult = await step.run(`youtube-${author.id}`, async () => {
          try {
            console.log(`[Inngest Cron] Polling YouTube for ${author.name}`)

            // 只取最新一頁
            const videos = await fetchYoutubeVideoPage(author.cmoneyYoutubeChannelId!)
            let newCount = 0

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
              newCount = eventsToSend.length
              console.log(`[Inngest Cron] Found ${eventsToSend.length} new videos for ${author.name}`)
            }

            return { processed: videos.length, new: newCount }
          } catch (error: any) {
            console.error(`[Inngest Cron] Error polling YouTube for ${author.name}:`, error)
            return { processed: 0, new: 0, error: `YouTube ${author.name}: ${error.message}` }
          }
        })

        results.videosProcessed += youtubeResult.processed
        results.videosNew += youtubeResult.new
        if ('error' in youtubeResult && youtubeResult.error) results.errors.push(youtubeResult.error)
      }
    }

    console.log('[Inngest Cron] CMoney Poll completed:', results)

    return {
      success: true,
      ...results,
    }
  }
)

// ========== 投資網誌文章 → Threads ==========

/**
 * 定期抓取投資網誌新文章
 * 每 2 小時執行一次
 */
export const blogArticlePollingCron = inngest.createFunction(
  { id: 'blog-article-polling-cron' },
  { cron: '0 */2 * * *' },
  async ({ step }) => {
    const db = useDB()
    const results = {
      authorsChecked: 0,
      articlesFound: 0,
      articlesNew: 0,
      errors: [] as string[],
    }

    // 取得所有有 blogAuthorSlug 且有 Threads 連結的作者
    const authorsWithThreads = await step.run('get-blog-authors', async () => {
      const allAuthors = await db
        .select()
        .from(schema.authors)
        .where(isNotNull(schema.authors.blogAuthorSlug))

      // 檢查哪些作者有 Threads 連結
      const authorsWithAccounts = []
      for (const author of allAuthors) {
        const threadsAccount = await db.query.socialAccounts.findFirst({
          where: and(
            eq(schema.socialAccounts.authorId, author.id),
            eq(schema.socialAccounts.platform, 'threads'),
          ),
        })
        if (threadsAccount) {
          authorsWithAccounts.push(author)
        }
      }
      return authorsWithAccounts
    })

    console.log(`[Blog Cron] Found ${authorsWithThreads.length} authors with blogAuthorSlug + Threads`)

    for (const author of authorsWithThreads) {
      results.authorsChecked++

      const articleResult = await step.run(`blog-${author.id}`, async () => {
        try {
          console.log(`[Blog Cron] Polling articles for ${author.name} (slug: ${author.blogAuthorSlug})`)

          // 取最近 4 小時的文章（稍微重疊以避免遺漏）
          const now = Date.now()
          const startAt = now - 4 * 60 * 60 * 1000
          const endAt = now

          const { plainTextNotes } = await fetchInvestmentNotes(
            author.blogAuthorSlug!,
            startAt,
            endAt,
            'all'
          )

          let newCount = 0
          const eventsToSend: Array<{
            name: 'blog/article.new'
            data: { blogArticleId: string; authorId: string }
          }> = []

          for (const note of plainTextNotes) {
            // 檢查是否已存在
            const existing = await db.query.blogArticles.findFirst({
              where: eq(schema.blogArticles.articleId, note.articleId),
            })

            if (!existing) {
              const id = nanoid()
              await db.insert(schema.blogArticles).values({
                id,
                articleId: note.articleId,
                authorId: author.id,
                blogAuthorSlug: author.blogAuthorSlug!,
                title: note.title,
                content: note.plainContent,
                tags: JSON.stringify(note.tags || []),
                articleCreatedAt: note.createdAt,
                pricingModel: 'free', // API 回傳不分 pricing，預設 free
                processStatus: 'pending',
                discoveredAt: new Date(),
              })

              eventsToSend.push({
                name: 'blog/article.new',
                data: { blogArticleId: id, authorId: author.id },
              })
              newCount++
            }
          }

          if (eventsToSend.length > 0) {
            await inngest.send(eventsToSend)
            console.log(`[Blog Cron] Found ${eventsToSend.length} new articles for ${author.name}`)
          }

          return { found: plainTextNotes.length, new: newCount }
        } catch (error: any) {
          console.error(`[Blog Cron] Error polling articles for ${author.name}:`, error)
          return { found: 0, new: 0, error: `Blog ${author.name}: ${error.message}` }
        }
      })

      results.articlesFound += articleResult.found
      results.articlesNew += articleResult.new
      if ('error' in articleResult && articleResult.error) results.errors.push(articleResult.error)
    }

    console.log('[Blog Cron] Completed:', results)
    return { success: true, ...results }
  }
)

/**
 * 處理單篇投資網誌文章 → AI 摘要 → 發到 Threads
 */
export const processBlogArticle = inngest.createFunction(
  {
    id: 'process-blog-article',
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error('[Inngest] processBlogArticle failed:', error)
      const db = useDB()
      const blogArticleId = (event.data as any).blogArticleId as string

      if (blogArticleId) {
        await db.update(schema.blogArticles)
          .set({
            processStatus: 'failed',
            errorMessage: error.message,
          })
          .where(eq(schema.blogArticles.id, blogArticleId))
      }
    },
  },
  { event: 'blog/article.new' },
  async ({ event, step }) => {
    const { blogArticleId, authorId } = event.data
    const db = useDB()

    // Step 1: 載入文章資料
    const article = await step.run('load-article', async () => {
      const found = await db.query.blogArticles.findFirst({
        where: eq(schema.blogArticles.id, blogArticleId),
      })
      if (!found) throw new Error(`Blog article not found: ${blogArticleId}`)

      // 標記為處理中
      await db.update(schema.blogArticles)
        .set({ processStatus: 'processing' })
        .where(eq(schema.blogArticles.id, blogArticleId))

      return found
    })

    // Step 2: AI 摘要
    const summary = await step.run('summarize', async () => {
      const OpenAI = (await import('openai')).default
      const config = useRuntimeConfig()
      const openai = new OpenAI({ apiKey: config.openaiApiKey })

      // 取得作者人設
      const persona = await getAuthorPersona(authorId)

      const articleUrl = getArticleUrl(article.blogAuthorSlug, article.articleId)
      const tags: string[] = article.tags ? JSON.parse(article.tags) : []

      let systemPrompt = `你是專業的投資內容摘要專家，負責將投資網誌文章摘要為 Threads 貼文格式。

## 語言要求
- 必須使用繁體中文（台灣用語）
- 禁止使用任何簡體字

## 格式要求
- 500 字以內
- 保留核心觀點和結論
- 使用短句、頻繁換行
- 像跟朋友聊天一樣分享文章重點
- 結尾附上原文連結
- 加 2-4 個相關 hashtag`

      if (persona?.persona) {
        systemPrompt += `\n\n## 作者人設（必須遵循）\n${persona.persona}`
      }
      if (persona?.styleGuidelines) {
        systemPrompt += `\n\n## 風格指引\n${persona.styleGuidelines}`
      }

      const userPrompt = `請將以下投資網誌文章摘要為 Threads 貼文：

## 文章標題
${article.title}

## 文章內容
${article.content}

## 原文連結
${articleUrl}

## 文章標籤
${tags.join(', ')}

請生成 500 字以內的 Threads 貼文，保留核心觀點，附上原文連結，加相關 hashtag。`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      })

      return completion.choices[0].message.content || ''
    })

    if (!summary) {
      throw new Error('AI 摘要產生失敗（空內容）')
    }

    // Step 3: 發布到 Threads
    const publishResult = await step.run('publish', async () => {
      const { accessToken, userId } = await getValidThreadsToken(authorId)
      return await publishToThreads(userId, summary, accessToken)
    })

    // Step 4: 記錄結果
    await step.run('record', async () => {
      const now = new Date()

      if (publishResult.success) {
        // 建立 publishRecord
        const recordId = nanoid()
        await db.insert(schema.publishRecords).values({
          id: recordId,
          platform: 'threads',
          content: summary,
          status: 'success',
          platformPostId: publishResult.postId,
          postUrl: publishResult.postUrl,
          createdAt: now,
        })

        // 更新 blogArticle 狀態
        await db.update(schema.blogArticles)
          .set({
            processStatus: 'completed',
            publishRecordId: recordId,
            processedAt: now,
          })
          .where(eq(schema.blogArticles.id, blogArticleId))

        console.log(`[Blog] Published article "${article.title}" to Threads: ${publishResult.postUrl}`)
      } else {
        await db.update(schema.blogArticles)
          .set({
            processStatus: 'failed',
            errorMessage: publishResult.error || '發布失敗',
            processedAt: now,
          })
          .where(eq(schema.blogArticles.id, blogArticleId))

        throw new Error(`Threads 發布失敗: ${publishResult.error}`)
      }
    })

    return {
      success: true,
      articleTitle: article.title,
      postUrl: publishResult.postUrl,
    }
  }
)

/**
 * 同學會文章輪詢 Cron
 * 定期抓取同學會社團文章，發現新文章後觸發處理
 */
export const groupArticlePollingCron = inngest.createFunction(
  { id: 'group-article-polling-cron' },
  { cron: '0 */2 * * *' },
  async ({ step }) => {
    const db = useDB()
    const results = {
      projectsChecked: 0,
      articlesFound: 0,
      articlesNew: 0,
      errors: [] as string[],
    }

    // 取得所有以同學會為輸入的專案
    const groupProjects = await step.run('get-group-projects', async () => {
      const allProjects = await db
        .select()
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.inputPlatform, 'cmoney_classmate'),
            eq(schema.projects.isActive, true),
          )
        )
      return allProjects
    })

    console.log(`[Group Cron] Found ${groupProjects.length} group article projects`)

    for (const project of groupProjects) {
      results.projectsChecked++

      const articleResult = await step.run(`group-${project.id}`, async () => {
        try {
          const inputConfig = project.inputConfig ? JSON.parse(project.inputConfig as string) : {}
          const boardId = inputConfig.boardId
          if (!boardId) {
            return { found: 0, new: 0, error: `Project ${project.name}: missing boardId` }
          }

          console.log(`[Group Cron] Polling board ${boardId} for project "${project.name}"`)

          // 用 MCP server 或直接 fetch，取最近 4 小時的文章
          const { fetchGroupArticles } = await import('~/server/services/cmoney/groupArticles')
          const now = new Date()
          const startAt = new Date(now.getTime() - 4 * 60 * 60 * 1000)

          const { articles } = await fetchGroupArticles(boardId, startAt, now)

          let newCount = 0
          const eventsToSend: Array<{
            name: 'group/article.new'
            data: { groupArticleId: string; authorId: string; projectId: string }
          }> = []

          for (const article of articles) {
            // 檢查是否已存在
            const existing = await db.query.groupArticles.findFirst({
              where: eq(schema.groupArticles.articleId, String(article.articleId)),
            })

            if (!existing) {
              const id = nanoid()
              await db.insert(schema.groupArticles).values({
                id,
                articleId: String(article.articleId),
                authorId: project.authorId,
                boardId,
                creatorId: article.creatorId,
                creatorName: article.creatorName,
                title: article.contentTitle || null,
                content: article.contentText,
                articleCreatedAt: article.createTime,
                processStatus: 'pending',
                discoveredAt: new Date(),
              })

              eventsToSend.push({
                name: 'group/article.new',
                data: { groupArticleId: id, authorId: project.authorId, projectId: project.id },
              })
              newCount++
            }
          }

          if (eventsToSend.length > 0) {
            await inngest.send(eventsToSend)
            console.log(`[Group Cron] Found ${eventsToSend.length} new articles in board ${boardId}`)
          }

          return { found: articles.length, new: newCount }
        } catch (error: any) {
          console.error(`[Group Cron] Error polling project "${project.name}":`, error)
          return { found: 0, new: 0, error: `${project.name}: ${error.message}` }
        }
      })

      results.articlesFound += articleResult.found
      results.articlesNew += articleResult.new
      if ('error' in articleResult && articleResult.error) results.errors.push(articleResult.error)
    }

    console.log('[Group Cron] Completed:', results)
    return { success: true, ...results }
  }
)

/**
 * 處理單篇同學會文章 → AI 摘要 → 發到 Threads
 */
export const processGroupArticle = inngest.createFunction(
  {
    id: 'process-group-article',
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error('[Inngest] processGroupArticle failed:', error)
      const db = useDB()
      const groupArticleId = (event.data as any).groupArticleId as string

      if (groupArticleId) {
        await db.update(schema.groupArticles)
          .set({
            processStatus: 'failed',
            errorMessage: error.message,
          })
          .where(eq(schema.groupArticles.id, groupArticleId))
      }
    },
  },
  { event: 'group/article.new' },
  async ({ event, step }) => {
    const { groupArticleId, authorId, projectId } = event.data
    const db = useDB()

    // Step 1: 載入文章
    const article = await step.run('load-article', async () => {
      const found = await db.query.groupArticles.findFirst({
        where: eq(schema.groupArticles.id, groupArticleId),
      })
      if (!found) throw new Error(`Group article not found: ${groupArticleId}`)

      await db.update(schema.groupArticles)
        .set({ processStatus: 'processing' })
        .where(eq(schema.groupArticles.id, groupArticleId))

      return found
    })

    // Step 2: 確定輸出平台
    const project = await step.run('load-project', async () => {
      if (!projectId) return null
      return await db.query.projects.findFirst({
        where: eq(schema.projects.id, projectId),
      })
    })

    const outputPlatforms: string[] = project?.outputPlatforms
      ? JSON.parse(project.outputPlatforms as string)
      : ['threads']

    // Step 3: AI 摘要（轉成 Threads 短文）
    const summary = await step.run('summarize', async () => {
      const OpenAI = (await import('openai')).default
      const config = useRuntimeConfig()
      const openai = new OpenAI({ apiKey: config.openaiApiKey })

      const persona = await getAuthorPersona(authorId)

      let systemPrompt = `你是專業的投資內容摘要專家，負責將同學會文章改寫為社群貼文格式。

## 語言要求
- 必須使用繁體中文（台灣用語）
- 如果原文是簡體中文，必須轉為繁體中文
- 禁止使用任何簡體字

## 格式要求
- 500 字以內
- 保留核心觀點、投資操作、市場分析
- 使用短句、頻繁換行
- 像跟朋友聊天一樣分享觀點
- 保留具體的股票代碼和價格
- 加 2-4 個相關 hashtag`

      if (persona?.persona) {
        systemPrompt += `\n\n## 作者人設（必須遵循）\n${persona.persona}`
      }
      if (persona?.styleGuidelines) {
        systemPrompt += `\n\n## 風格指引\n${persona.styleGuidelines}`
      }

      const contentParts = []
      if (article.title) contentParts.push(`## 標題\n${article.title}`)
      contentParts.push(`## 內容\n${article.content}`)

      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `請將以下同學會文章改寫為社群貼文：\n\n${contentParts.join('\n\n')}` },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      })

      return completion.choices[0].message.content || ''
    })

    if (!summary) {
      throw new Error('AI 摘要產生失敗（空內容）')
    }

    // Step 4: 發布到各平台
    const publishResult = await step.run('publish', async () => {
      // 目前先支援 Threads
      if (outputPlatforms.includes('threads')) {
        const { accessToken, userId } = await getValidThreadsToken(authorId)
        return await publishToThreads(userId, summary, accessToken)
      }
      return { success: false, error: '無可用的輸出平台' } as any
    })

    // Step 5: 記錄結果
    await step.run('record', async () => {
      const now = new Date()

      if (publishResult.success) {
        const recordId = nanoid()
        await db.insert(schema.publishRecords).values({
          id: recordId,
          projectId: projectId || null,
          platform: 'threads',
          content: summary,
          status: 'success',
          platformPostId: publishResult.postId,
          postUrl: publishResult.postUrl,
          createdAt: now,
        })

        await db.update(schema.groupArticles)
          .set({
            processStatus: 'completed',
            publishRecordId: recordId,
            processedAt: now,
          })
          .where(eq(schema.groupArticles.id, groupArticleId))

        console.log(`[Group] Published article "${article.title || article.articleId}" to Threads: ${publishResult.postUrl}`)
      } else {
        await db.update(schema.groupArticles)
          .set({
            processStatus: 'failed',
            errorMessage: publishResult.error || '發布失敗',
            processedAt: now,
          })
          .where(eq(schema.groupArticles.id, groupArticleId))

        throw new Error(`發布失敗: ${publishResult.error}`)
      }
    })

    return {
      success: true,
      articleId: article.articleId,
      postUrl: publishResult.postUrl,
    }
  }
)

// 匯出所有函數
export const functions = [
  processYouTubeVideo,
  processCMoneyPodcast,
  processCMoneyYoutube,
  youtubePollingCron,
  subscriptionRenewalCron,
  cmoneyPollingCron,
  blogArticlePollingCron,
  processBlogArticle,
  groupArticlePollingCron,
  processGroupArticle,
]
