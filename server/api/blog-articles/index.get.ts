import { eq, desc } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

/**
 * GET /api/blog-articles?authorId=xxx
 * 查詢投資網誌文章列表
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const authorId = query.authorId as string | undefined

  const db = useDB()

  let articles
  if (authorId) {
    articles = await db
      .select()
      .from(schema.blogArticles)
      .where(eq(schema.blogArticles.authorId, authorId))
      .orderBy(desc(schema.blogArticles.discoveredAt))
      .limit(50)
  } else {
    articles = await db
      .select()
      .from(schema.blogArticles)
      .orderBy(desc(schema.blogArticles.discoveredAt))
      .limit(50)
  }

  // 附帶 publishRecord 資訊
  const articlesWithRecords = await Promise.all(
    articles.map(async (article) => {
      let publishRecord = null
      if (article.publishRecordId) {
        publishRecord = await db.query.publishRecords.findFirst({
          where: eq(schema.publishRecords.id, article.publishRecordId),
        })
      }
      return {
        ...article,
        tags: article.tags ? JSON.parse(article.tags) : [],
        publishRecord,
      }
    })
  )

  return {
    articles: articlesWithRecords,
    total: articlesWithRecords.length,
  }
})
