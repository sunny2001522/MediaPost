import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { generatePost } from '~/server/services/openai'
import { getYouTubeVideoInfo, extractMarketingSummary } from '~/server/services/youtube'
import { transcribeFromUrl, transcribeYouTube } from '~/server/services/audio'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()

  const id = nanoid()
  const now = new Date()

  const podcast = {
    id,
    title: body.title || 'Untitled',
    authorId: body.authorId || null,
    sourceType: body.sourceType as 'upload' | 'youtube',
    sourceUrl: body.sourceUrl || null,
    audioFileUrl: body.audioFileUrl || null,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.podcasts).values(podcast)

  // 自動開始轉錄和生成貼文（非阻塞）
  // 如果有手動輸入的描述，優先使用
  const manualDescription = body.manualDescription || null
  startProcessing(id, podcast.sourceType, podcast.sourceUrl, podcast.audioFileUrl, podcast.title, podcast.authorId, manualDescription)

  return podcast
})

// 非阻塞處理
async function startProcessing(
  id: string,
  sourceType: string,
  sourceUrl: string | null,
  audioFileUrl: string | null,
  title: string,
  authorId: string | null,
  manualDescription: string | null
) {
  const db = useDB()

  try {
    // 1. 更新狀態為轉錄中
    await db.update(schema.podcasts)
      .set({ status: 'transcribing', updatedAt: new Date() })
      .where(eq(schema.podcasts.id, id))

    console.log('[Auto Process] Starting transcription for:', id)

    // 2. 處理 YouTube 描述（手動輸入優先，否則自動抓取）
    let youtubeDescription: string | null = null

    if (manualDescription) {
      // 優先使用手動輸入的描述
      youtubeDescription = manualDescription
      console.log('[Auto Process] Using manual description, length:', youtubeDescription.length)
    } else if (sourceType === 'youtube' && sourceUrl) {
      // 自動從 YouTube API 抓取
      let authorName: string | undefined
      if (authorId) {
        const author = await db.query.authors.findFirst({
          where: eq(schema.authors.id, authorId)
        })
        authorName = author?.name
      }

      const videoInfo = await getYouTubeVideoInfo(sourceUrl)
      if (videoInfo) {
        // 根據作者名稱套用不同的清理規則
        youtubeDescription = extractMarketingSummary(videoInfo.description, authorName)
        console.log('[Auto Process] YouTube description fetched, length:', youtubeDescription?.length || 0)
      }
    }

    // 保存描述到資料庫
    if (youtubeDescription) {
      await db.update(schema.podcasts)
        .set({ youtubeDescription })
        .where(eq(schema.podcasts.id, id))
    }

    // 3. 轉錄
    let transcript: string

    if (sourceType === 'youtube' && sourceUrl) {
      const result = await transcribeYouTube(sourceUrl)
      transcript = result.transcript
    } else if (audioFileUrl) {
      const result = await transcribeFromUrl(audioFileUrl)
      transcript = result.transcript
    } else {
      throw new Error('No audio source available')
    }

    // 4. 保存轉錄結果
    await db.update(schema.podcasts)
      .set({
        transcript,
        status: 'generating',
        updatedAt: new Date()
      })
      .where(eq(schema.podcasts.id, id))

    console.log('[Auto Process] Transcription done, generating posts for:', id)

    // 5. 生成貼文（傳入 YouTube 描述）
    const { content, tokenCount, generationTimeMs } = await generatePost(
      transcript,
      title,
      undefined,           // duration
      undefined,           // userPreferences
      undefined,           // authorName
      5,                   // postCount
      [],                  // excludeAngles
      youtubeDescription   // youtubeDescription
    )

    // 6. 保存生成結果
    const generationId = nanoid()
    await db.insert(schema.generations).values({
      id: generationId,
      podcastId: id,
      originalContent: content,
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      tokenCount,
      generationTimeMs,
      createdAt: new Date()
    })

    // 7. 更新狀態為完成
    await db.update(schema.podcasts)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(schema.podcasts.id, id))

    console.log('[Auto Process] Completed for:', id)

  } catch (error: any) {
    console.error('[Auto Process] Error:', error)
    await db.update(schema.podcasts)
      .set({
        status: 'error',
        errorMessage: error.message,
        updatedAt: new Date()
      })
      .where(eq(schema.podcasts.id, id))
  }
}
