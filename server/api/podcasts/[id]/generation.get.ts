import { eq, asc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  const db = useDB()

  // 取得所有批次的 generations，按 batchIndex 排序
  const generations = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.podcastId, id))
    .orderBy(asc(schema.generations.batchIndex))

  if (generations.length === 0) {
    return null
  }

  // 合併所有貼文內容
  const mergedContent = generations
    .map(g => g.originalContent)
    .join('\n---POST---\n')

  // 計算總貼文數
  const totalPosts = generations.reduce((sum, g) => {
    const posts = g.originalContent.split('---POST---').filter(p => p.trim())
    return sum + posts.length
  }, 0)

  return {
    generations,
    mergedContent,
    totalPosts,
    // 向後兼容：提供最新的 generation 資訊
    id: generations[generations.length - 1].id,
    podcastId: id,
    originalContent: mergedContent,
    createdAt: generations[0].createdAt,
  }
})
