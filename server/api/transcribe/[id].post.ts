import { eq } from 'drizzle-orm'
import fs from 'fs/promises'
import { useDB, schema } from '~/server/database/client'
import { transcribeFromUrl, transcribeYouTube, transcribeFromPath } from '~/server/services/audio'
import { downloadCMoneyAudio } from '~/server/services/audio/cmoney'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  console.log('[Transcribe] Starting for podcast:', id)

  const db = useDB()

  // 獲取 podcast
  const [podcast] = await db
    .select()
    .from(schema.podcasts)
    .where(eq(schema.podcasts.id, id))

  if (!podcast) {
    throw createError({ statusCode: 404, message: 'Podcast not found' })
  }

  // 更新狀態為轉錄中
  await db.update(schema.podcasts)
    .set({ status: 'transcribing', updatedAt: new Date() })
    .where(eq(schema.podcasts.id, id))

  try {
    let transcript: string

    console.log('[Transcribe] Podcast data:', {
      sourceType: podcast.sourceType,
      sourceUrl: podcast.sourceUrl,
      audioFileUrl: podcast.audioFileUrl
    })

    if (podcast.sourceType === 'youtube' && podcast.sourceUrl) {
      // YouTube：使用 OpenAI Whisper (透過 cobalt.tools 下載)
      console.log('[Transcribe] Using OpenAI Whisper for YouTube:', podcast.sourceUrl)
      const result = await transcribeYouTube(podcast.sourceUrl)
      transcript = result.transcript
    } else if (podcast.sourceType === 'cmoney' && podcast.sourceUrl) {
      // CMoney：下載音檔後使用 OpenAI Whisper
      console.log('[Transcribe] Using OpenAI Whisper for CMoney:', podcast.sourceUrl)
      const { localPath } = await downloadCMoneyAudio(podcast.sourceUrl)
      try {
        const result = await transcribeFromPath(localPath)
        transcript = result.transcript
      } finally {
        // 清理暫存檔案
        await fs.unlink(localPath).catch(() => {})
      }
    } else if (podcast.audioFileUrl) {
      // 上傳的音檔：使用 OpenAI Whisper
      console.log('[Transcribe] Using OpenAI Whisper for audio:', podcast.audioFileUrl)
      const result = await transcribeFromUrl(podcast.audioFileUrl)
      transcript = result.transcript
    } else {
      throw new Error('No audio source available')
    }

    // 更新轉錄結果
    await db.update(schema.podcasts)
      .set({
        transcript,
        status: 'completed',
        updatedAt: new Date()
      })
      .where(eq(schema.podcasts.id, id))

    return { success: true, transcript }
  } catch (error: any) {
    console.error('[Transcribe] Error:', error)

    // 更新錯誤狀態
    await db.update(schema.podcasts)
      .set({
        status: 'error',
        errorMessage: error.message,
        updatedAt: new Date()
      })
      .where(eq(schema.podcasts.id, id))

    throw createError({
      statusCode: 500,
      message: `Transcription failed: ${error.message}`
    })
  }
})
