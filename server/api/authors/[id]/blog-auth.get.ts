/**
 * 取得作者的投資網誌認證狀態
 * GET /api/authors/{id}/blog-auth
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const authorId = getRouterParam(event, 'id')

  if (!authorId) {
    throw createError({
      statusCode: 400,
      message: 'Missing author ID',
    })
  }

  const db = useDB()

  const author = await db.query.authors.findFirst({
    where: eq(schema.authors.id, authorId),
  })

  if (!author) {
    throw createError({
      statusCode: 404,
      message: 'Author not found',
    })
  }

  // 檢查是否有認證設定（只需 authorSlug + userId）
  const hasAuth = !!(author.blogAuthorSlug && author.blogUserId)

  return {
    hasAuth,
    authorSlug: author.blogAuthorSlug || null,
    userId: author.blogUserId || null,
  }
})
