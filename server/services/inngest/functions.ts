import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { inngest } from './client'
import { useDB, schema } from '~/server/database/client'
import { generatePost } from '~/server/services/openai'
import { getYouTubeVideoInfo, extractMarketingSummary } from '~/server/services/youtube'
import { downloadYouTubeAudio, cleanupYouTubeAudio } from '~/server/services/audio/youtube'
import { downloadCMoneyAudio, cleanupCMoneyAudio } from '~/server/services/audio/cmoney'
import { transcribeFromPath } from '~/server/services/audio'

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

// 匯出所有函數
export const functions = [processYouTubeVideo, processCMoneyPodcast, processCMoneyYoutube]
