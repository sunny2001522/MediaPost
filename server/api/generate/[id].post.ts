import { nanoid } from 'nanoid'
import { eq, desc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { generatePost, POST_ANGLES, type AngleId } from '~/server/services/openai'
import { learningEngine } from '~/server/services/learning/LearningEngine'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  const db = useDB()

  // 獲取 podcast（使用 JOIN 取得作者）
  const [result] = await db
    .select({
      podcast: schema.podcasts,
      authorId: schema.authors.id,
      authorName: schema.authors.name,
    })
    .from(schema.podcasts)
    .leftJoin(schema.authors, eq(schema.podcasts.authorId, schema.authors.id))
    .where(eq(schema.podcasts.id, id))
    .limit(1)

  if (!result) {
    throw createError({ statusCode: 404, message: 'Podcast not found' })
  }

  const { podcast, authorId, authorName } = result

  if (!podcast.transcript) {
    throw createError({ statusCode: 400, message: 'Podcast not transcribed yet' })
  }

  // 取得發布日期（根據來源類型查詢）
  let publishDate: Date | string | number | null = null
  if (podcast.sourceType === 'youtube') {
    // 從 youtubeVideos 取得 publishedAt
    const videoRecord = await db.query.youtubeVideos.findFirst({
      where: eq(schema.youtubeVideos.podcastId, id),
    })
    publishDate = videoRecord?.publishedAt || null
  } else if (podcast.sourceType === 'cmoney') {
    // 從 cmoneyPodcastEpisodes 取得 pubDate
    const episodeRecord = await db.query.cmoneyPodcastEpisodes.findFirst({
      where: eq(schema.cmoneyPodcastEpisodes.podcastId, id),
    })
    if (episodeRecord?.pubDate) {
      // pubDate 是 Unix timestamp 字串，轉為數字
      publishDate = parseInt(episodeRecord.pubDate, 10)
    }
  }
  // 如果都沒有，使用 podcast.createdAt 作為備用
  if (!publishDate) {
    publishDate = podcast.createdAt
  }

  // 檢查現有的 generations，取得已使用的視角
  const existingGenerations = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.podcastId, id))

  const usedAngles = existingGenerations
    .map(g => g.angleCategory)
    .filter(Boolean) as AngleId[]

  // 計算還有多少視角可用
  const availableAngles = POST_ANGLES.filter(a => !usedAngles.includes(a.id))

  if (availableAngles.length === 0) {
    throw createError({
      statusCode: 400,
      message: '所有視角都已使用完畢，無法再生成新貼文'
    })
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

    // 決定要生成幾篇（最多 5 篇，但不超過可用視角數）
    const postCount = Math.min(5, availableAngles.length)

    // 生成貼文（排除已使用的視角，傳入 YouTube 描述、作者 ID 和 Podcast 連結）
    const { content, tokenCount, generationTimeMs, anglesUsed } = await generatePost(
      podcast.transcript,
      podcast.title,
      podcast.duration ?? undefined,
      userPreferences || undefined,
      authorName ?? undefined,
      postCount,
      usedAngles,
      podcast.youtubeDescription,
      authorId ?? undefined,
      podcast.sourceUrl ?? undefined,
      publishDate // 傳入發布日期
    )

    // 解析生成的貼文並分別儲存
    const posts = content.split('---POST---').map(p => p.trim()).filter(Boolean)
    const maxBatchIndex = existingGenerations.length > 0
      ? Math.max(...existingGenerations.map(g => g.batchIndex))
      : -1

    const generationIds: string[] = []

    for (let i = 0; i < posts.length; i++) {
      const generationId = nanoid()
      generationIds.push(generationId)

      await db.insert(schema.generations).values({
        id: generationId,
        podcastId: id,
        originalContent: posts[i],
        batchIndex: maxBatchIndex + 1 + i,
        angleCategory: anglesUsed[i] || null,
        promptVersionId: promptVersion?.id,
        promptSnapshot: promptVersion?.compiledPrompt,
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        tokenCount: Math.round(tokenCount / posts.length),
        generationTimeMs: Math.round(generationTimeMs / posts.length),
        createdAt: new Date()
      })
    }

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
      generationIds,
      postsGenerated: posts.length,
      anglesUsed,
      totalPosts: existingGenerations.length + posts.length,
      remainingAngles: POST_ANGLES.length - usedAngles.length - posts.length,
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
