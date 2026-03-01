import { eq, asc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  const db = useDB()

  // 取得所有 generations，按 batchIndex 排序
  // 新版本：每個 generation 就是一篇貼文
  const generations = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.podcastId, id))
    .orderBy(asc(schema.generations.batchIndex))

  if (generations.length === 0) {
    return null
  }

  // 合併所有貼文內容（用 ---POST--- 分隔）
  const mergedContent = generations
    .map(g => g.originalContent)
    .join('\n---POST---\n')

  return {
    // 每個 generation 就是一篇貼文，有獨立的 ID
    generations: generations.map(g => ({
      id: g.id,
      originalContent: g.originalContent,
      batchIndex: g.batchIndex,
    })),
    mergedContent,
    totalPosts: generations.length,
    // 向後兼容
    id: generations[generations.length - 1].id,
    podcastId: id,
    originalContent: mergedContent,
    createdAt: generations[0].createdAt,
  }
})
