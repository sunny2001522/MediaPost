import { nanoid } from 'nanoid'
import { eq, desc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { generatePost } from '~/server/services/openai'
import { learningEngine } from '~/server/services/learning/LearningEngine'

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

  if (!podcast.transcript) {
    throw createError({ statusCode: 400, message: 'Podcast not transcribed yet' })
  }

  // 更新狀態為生成中
  await db.update(schema.podcasts)
    .set({ status: 'generating', updatedAt: new Date() })
    .where(eq(schema.podcasts.id, id))

  try {
    // 獲取用戶偏好
    const userPreferences = await learningEngine.getActiveUserPreferences()

    // 獲取當前活躍的 prompt 版本
    const [promptVersion] = await db
      .select()
      .from(schema.promptVersions)
      .where(eq(schema.promptVersions.isActive, true))
      .orderBy(desc(schema.promptVersions.version))
      .limit(1)

    // 生成貼文
    const { content, tokenCount, generationTimeMs } = await generatePost(
      podcast.transcript,
      podcast.title,
      podcast.duration || undefined,
      userPreferences || undefined
    )

    // 儲存 generation
    const generationId = nanoid()
    await db.insert(schema.generations).values({
      id: generationId,
      podcastId: id,
      originalContent: content,
      promptVersionId: promptVersion?.id,
      promptSnapshot: promptVersion?.compiledPrompt,
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      tokenCount,
      generationTimeMs,
      createdAt: new Date()
    })

    // 更新 prompt 使用次數
    if (promptVersion) {
      await db.update(schema.promptVersions)
        .set({ usageCount: (promptVersion.usageCount || 0) + 1 })
        .where(eq(schema.promptVersions.id, promptVersion.id))
    }

    // 更新 podcast 狀態
    await db.update(schema.podcasts)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(schema.podcasts.id, id))

    return {
      success: true,
      generationId,
      content,
      tokenCount,
      generationTimeMs
    }
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
      message: `Generation failed: ${error.message}`
    })
  }
})
