/**
 * 設定/更新作者的 CMoney 認證
 * PUT /api/authors/{id}/cmoney-auth
 *
 * 支援兩種認證方式：
 * 1. clientId + account + password（grant_type=password）
 * 2. clientId + refreshToken（grant_type=refresh_token）
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { fetchCMoneyToken, fetchCMoneyTokenByRefreshToken } from '~/server/services/cmoney'

interface CMoneyAuthBody {
  clientId: string
  account?: string
  password?: string
  refreshToken?: string
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
  const { clientId, account, password, refreshToken } = body

  if (!clientId) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: clientId',
    })
  }

  const hasPasswordAuth = !!(account && password)
  const hasRefreshTokenAuth = !!refreshToken

  if (!hasPasswordAuth && !hasRefreshTokenAuth) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: provide (account + password) or (refreshToken)',
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
  let tokenResult

  if (hasRefreshTokenAuth) {
    console.log(`[CMoney Auth] 驗證 refresh_token 認證 (作者: ${author.name})...`)
    tokenResult = await fetchCMoneyTokenByRefreshToken(clientId, refreshToken!)
  } else {
    console.log(`[CMoney Auth] 驗證 password 認證 (作者: ${author.name}, 帳號: ${account})...`)
    tokenResult = await fetchCMoneyToken(clientId, account!, password!)
  }

  if (!tokenResult.success) {
    console.error(`[CMoney Auth] 驗證失敗:`, tokenResult.error)
    throw createError({
      statusCode: 400,
      message: `CMoney 認證失敗: ${tokenResult.error}`,
    })
  }

  // 驗證成功，更新資料庫
  const updateData: Record<string, any> = {
    cmoneyClientId: clientId,
    cmoneyAccessToken: tokenResult.data.accessToken,
    cmoneyTokenExpiresAt: tokenResult.data.expiresAt,
    updatedAt: new Date(),
  }

  if (hasRefreshTokenAuth) {
    // refresh_token 模式：儲存 refresh_token，若回傳新的則更新
    updateData.cmoneyRefreshToken = tokenResult.data.refreshToken || refreshToken
  } else {
    // password 模式：儲存帳號密碼
    updateData.cmoneyAccount = account
    updateData.cmoneyPassword = password
    // 如果回傳了 refresh_token 也一併存起來
    if (tokenResult.data.refreshToken) {
      updateData.cmoneyRefreshToken = tokenResult.data.refreshToken
    }
  }

  await db
    .update(schema.authors)
    .set(updateData)
    .where(eq(schema.authors.id, authorId))

  console.log(`[CMoney Auth] 認證設定成功 (作者: ${author.name}, 方式: ${hasRefreshTokenAuth ? 'refresh_token' : 'password'})`)

  return {
    success: true,
    message: 'CMoney 認證設定成功',
    authMethod: hasRefreshTokenAuth ? 'refresh_token' : 'password',
    tokenExpiresAt: tokenResult.data.expiresAt.toISOString(),
  }
})
