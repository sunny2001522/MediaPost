import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { transcribeAudio, generatePost } from '~/server/services/openai'
import { processYouTubeVideo } from '~/server/services/youtube'

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
  startProcessing(id, podcast.sourceType, podcast.sourceUrl, podcast.audioFileUrl, podcast.title)

  return podcast
})

// 非阻塞處理
async function startProcessing(
  id: string,
  sourceType: string,
  sourceUrl: string | null,
  audioFileUrl: string | null,
  title: string
) {
  const db = useDB()

  try {
    // 1. 更新狀態為轉錄中
    await db.update(schema.podcasts)
      .set({ status: 'transcribing', updatedAt: new Date() })
      .where(eq(schema.podcasts.id, id))

    console.log('[Auto Process] Starting transcription for:', id)

    // 2. 轉錄
    let transcript: string

    if (sourceType === 'youtube' && sourceUrl) {
      const result = await processYouTubeVideo(sourceUrl)
      transcript = result.transcript
    } else if (audioFileUrl) {
      transcript = await transcribeAudio(audioFileUrl)
    } else {
      throw new Error('No audio source available')
    }

    // 3. 保存轉錄結果
    await db.update(schema.podcasts)
      .set({
        transcript,
        status: 'generating',
        updatedAt: new Date()
      })
      .where(eq(schema.podcasts.id, id))

    console.log('[Auto Process] Transcription done, generating posts for:', id)

    // 4. 生成貼文
    const { content, tokenCount, generationTimeMs } = await generatePost(
      transcript,
      title
    )

    // 5. 保存生成結果
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

    // 6. 更新狀態為完成
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
