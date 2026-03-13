/**
 * 設定/更新作者的投資網誌認證
 * PUT /api/authors/{id}/blog-auth
 *
 * 改用 Admin API，只需 authorSlug + userId
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

interface BlogAuthBody {
  authorSlug: string // 投資網誌作者 slug（如 "cmoney"）
  userId: string // CMoney User ID（如 "6870918203145058"）
}

export default defineEventHandler(async (event) => {
  const authorId = getRouterParam(event, 'id')

  if (!authorId) {
    throw createError({
      statusCode: 400,
      message: 'Missing author ID',
    })
  }

  const body = await readBody<BlogAuthBody>(event)
  const { authorSlug, userId } = body

  if (!authorSlug || !userId) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: authorSlug, userId',
    })
  }

  const db = useDB()

  // 確認作者存在
  const author = await db.query.authors.findFirst({
    where: eq(schema.authors.id, authorId),
  })

  if (!author) {
    throw createError({
      statusCode: 404,
      message: 'Author not found',
    })
  }

  // 直接儲存 authorSlug 和 userId（不再需要驗證帳密）
  console.log(`[Blog Auth] 設定投資網誌認證 (作者: ${author.name}, slug: ${authorSlug}, userId: ${userId})`)

  await db
    .update(schema.authors)
    .set({
      blogAuthorSlug: authorSlug,
      blogUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(schema.authors.id, authorId))

  console.log(`[Blog Auth] 投資網誌認證設定成功 (作者: ${author.name})`)

  return {
    success: true,
    message: '投資網誌認證設定成功',
  }
})
