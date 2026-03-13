import { nanoid } from 'nanoid'
import { eq, and, isNotNull } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { fetchInvestmentNotes } from '~/server/services/cmoney/investmentNotes'
import { inngest } from '~/server/services/inngest/client'

/**
 * POST /api/blog-articles/sync
 * 手動觸發投資網誌文章同步
 *
 * Body: { authorId?: string }
 * - authorId: 可選，不傳就全部有 blogAuthorSlug + Threads 的作者
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const targetAuthorId = body?.authorId as string | undefined

  const db = useDB()

  // 取得要同步的作者
  let authors
  if (targetAuthorId) {
    const author = await db.query.authors.findFirst({
      where: eq(schema.authors.id, targetAuthorId),
    })
    if (!author) {
      throw createError({ statusCode: 404, message: '作者不存在' })
    }
    if (!author.blogAuthorSlug) {
      throw createError({ statusCode: 400, message: '作者未設定 blogAuthorSlug' })
    }
    authors = [author]
  } else {
    // 取得所有有 blogAuthorSlug 的作者
    authors = await db
      .select()
      .from(schema.authors)
      .where(isNotNull(schema.authors.blogAuthorSlug))
  }

  const results = {
    authorsChecked: 0,
    articlesFound: 0,
    articlesNew: 0,
    errors: [] as string[],
  }

  for (const author of authors) {
    results.authorsChecked++

    try {
      // 取最近 24 小時的文章（手動同步取更大範圍）
      const now = Date.now()
      const startAt = now - 24 * 60 * 60 * 1000
      const endAt = now

      const { plainTextNotes } = await fetchInvestmentNotes(
        author.blogAuthorSlug!,
        startAt,
        endAt,
        'all'
      )

      results.articlesFound += plainTextNotes.length

      const eventsToSend: Array<{
        name: 'blog/article.new'
        data: { blogArticleId: string; authorId: string }
      }> = []

      for (const note of plainTextNotes) {
        const existing = await db.query.blogArticles.findFirst({
          where: eq(schema.blogArticles.articleId, note.articleId),
        })

        if (!existing) {
          const id = nanoid()
          await db.insert(schema.blogArticles).values({
            id,
            articleId: note.articleId,
            authorId: author.id,
            blogAuthorSlug: author.blogAuthorSlug!,
            title: note.title,
            content: note.plainContent,
            tags: JSON.stringify(note.tags || []),
            articleCreatedAt: note.createdAt,
            pricingModel: 'free',
            processStatus: 'pending',
            discoveredAt: new Date(),
          })

          eventsToSend.push({
            name: 'blog/article.new',
            data: { blogArticleId: id, authorId: author.id },
          })
          results.articlesNew++
        }
      }

      if (eventsToSend.length > 0) {
        await inngest.send(eventsToSend)
      }
    } catch (error: any) {
      console.error(`[Blog Sync] Error for ${author.name}:`, error)
      results.errors.push(`${author.name}: ${error.message}`)
    }
  }

  return {
    success: true,
    ...results,
  }
})
