/**
 * 取得作者的 CMoney 認證狀態
 * GET /api/authors/{id}/cmoney-auth
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { isTokenExpired } from '~/server/services/cmoney'

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

  // 檢查是否有認證設定
  const hasAuth = !!(author.cmoneyClientId && author.cmoneyAccount && author.cmoneyPassword)

  // 檢查 Token 是否有效
  const tokenValid = hasAuth && author.cmoneyAccessToken && !isTokenExpired(author.cmoneyTokenExpiresAt)

  return {
    hasAuth,
    account: author.cmoneyAccount || null,
    tokenValid,
    tokenExpiresAt: author.cmoneyTokenExpiresAt?.toISOString() || null,
  }
})
