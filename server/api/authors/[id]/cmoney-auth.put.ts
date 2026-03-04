/**
 * 設定/更新作者的 CMoney 認證
 * PUT /api/authors/{id}/cmoney-auth
 *
 * 設定認證時會同時驗證帳號密碼是否正確
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { fetchCMoneyToken } from '~/server/services/cmoney'

interface CMoneyAuthBody {
  clientId: string
  account: string
  password: string
}

export default defineEventHandler(async (event) => {
  const authorId = getRouterParam(event, 'id')

  if (!authorId) {
    throw createError({
      statusCode: 400,
      message: 'Missing author ID',
    })
  }

  const body = await readBody<CMoneyAuthBody>(event)
  const { clientId, account, password } = body

  if (!clientId || !account || !password) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: clientId, account, password',
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
  console.log(`[CMoney Auth] 驗證認證 (作者: ${author.name}, 帳號: ${account})...`)

  const tokenResult = await fetchCMoneyToken(clientId, account, password)

  if (!tokenResult.success) {
    console.error(`[CMoney Auth] 驗證失敗:`, tokenResult.error)
    throw createError({
      statusCode: 400,
      message: `CMoney 認證失敗: ${tokenResult.error}`,
    })
  }

  // 驗證成功，更新資料庫
  await db
    .update(schema.authors)
    .set({
      cmoneyClientId: clientId,
      cmoneyAccount: account,
      cmoneyPassword: password,
      cmoneyAccessToken: tokenResult.data.accessToken,
      cmoneyTokenExpiresAt: tokenResult.data.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.authors.id, authorId))

  console.log(`[CMoney Auth] 認證設定成功 (作者: ${author.name})`)

  return {
    success: true,
    message: 'CMoney 認證設定成功',
    tokenExpiresAt: tokenResult.data.expiresAt.toISOString(),
  }
})
