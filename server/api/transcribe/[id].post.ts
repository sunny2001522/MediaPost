import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { transcribeAudio } from '~/server/services/openai'
import { processYouTubeVideo } from '~/server/services/youtube'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

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

    if (podcast.sourceType === 'youtube' && podcast.sourceUrl) {
      // YouTube：使用 Replicate Whisper
      const result = await processYouTubeVideo(podcast.sourceUrl)
      transcript = result.transcript
    } else if (podcast.audioFileUrl) {
      // 上傳的音檔：使用 OpenAI Whisper
      transcript = await transcribeAudio(podcast.audioFileUrl)
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
