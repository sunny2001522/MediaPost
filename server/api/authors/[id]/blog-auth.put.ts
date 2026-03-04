/**
 * 設定/更新作者的投資網誌認證
 * PUT /api/authors/{id}/blog-auth
 *
 * 設定認證時會同時驗證帳號密碼是否正確
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { fetchBlogToken } from '~/server/services/cmoney'

interface BlogAuthBody {
  clientId: string
  account: string
  password: string
  authorSlug: string // 投資網誌作者 slug（如 "cmoney"）
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
  const { clientId, account, password, authorSlug } = body

  if (!clientId || !account || !password || !authorSlug) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: clientId, account, password, authorSlug',
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

  // 驗證認證是否有效（嘗試取得 Token）
  console.log(`[Blog Auth] 驗證投資網誌認證 (作者: ${author.name}, 帳號: ${account}, slug: ${authorSlug})...`)

  const tokenResult = await fetchBlogToken(clientId, account, password)

  if (!tokenResult.success) {
    console.error(`[Blog Auth] 驗證失敗:`, tokenResult.error)
    throw createError({
      statusCode: 400,
      message: `投資網誌認證失敗: ${tokenResult.error}`,
    })
  }

  // 驗證成功，更新資料庫
  await db
    .update(schema.authors)
    .set({
      blogClientId: clientId,
      blogAccount: account,
      blogPassword: password,
      blogAuthorSlug: authorSlug,
      blogAccessToken: tokenResult.data.accessToken,
      blogTokenExpiresAt: tokenResult.data.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.authors.id, authorId))

  console.log(`[Blog Auth] 投資網誌認證設定成功 (作者: ${author.name})`)

  return {
    success: true,
    message: '投資網誌認證設定成功',
    tokenExpiresAt: tokenResult.data.expiresAt.toISOString(),
  }
})
