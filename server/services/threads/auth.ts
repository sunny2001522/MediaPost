/**
 * Threads OAuth 認證服務
 *
 * 使用 Threads API OAuth 2.0 流程：
 * 1. Authorization Code → Short-lived Token (1 小時)
 * 2. Short-lived Token → Long-lived Token (60 天)
 * 3. Long-lived Token 可刷新（到期前刷新）
 */

import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { useDB, schema } from '~/server/database/client'

const THREADS_AUTH_BASE = 'https://threads.net/oauth/authorize'
const THREADS_TOKEN_URL = 'https://graph.threads.net/oauth/access_token'
const THREADS_GRAPH_BASE = 'https://graph.threads.net/v1.0'

// Token 提前刷新的緩衝時間（7 天）
const TOKEN_REFRESH_BUFFER_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 用 authorization code 換短期 token
 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string
  userId: string
}> {
  const config = useRuntimeConfig()

  const params = new URLSearchParams({
    client_id: config.threadsClientId,
    client_secret: config.threadsClientSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.threadsRedirectUri,
    code,
  })

  const response = await fetch(THREADS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error_message || `Token exchange failed (${response.status})`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    userId: String(data.user_id),
  }
}

/**
 * 短期 token → 長期 token (60天)
 */
export async function exchangeForLongLivedToken(shortToken: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const config = useRuntimeConfig()

  const params = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: config.threadsClientSecret,
    access_token: shortToken,
  })

  const response = await fetch(`${THREADS_GRAPH_BASE}/access_token?${params.toString()}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `Long-lived token exchange failed (${response.status})`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in, // 通常 5184000 秒 = 60 天
  }
}

/**
 * 刷新長期 token
 */
export async function refreshLongLivedToken(token: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const params = new URLSearchParams({
    grant_type: 'th_refresh_token',
    access_token: token,
  })

  const response = await fetch(`${THREADS_GRAPH_BASE}/refresh_access_token?${params.toString()}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `Token refresh failed (${response.status})`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  }
}

/**
 * 取得 Threads user profile
 */
export async function getThreadsUserProfile(token: string): Promise<{
  id: string
  username: string
}> {
  const response = await fetch(
    `${THREADS_GRAPH_BASE}/me?fields=id,username&access_token=${token}`
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `Failed to get user profile (${response.status})`)
  }

  const data = await response.json()

  return {
    id: String(data.id),
    username: data.username,
  }
}

/**
 * 從 DB 取得有效的 Threads token，7天內到期自動刷新
 */
export async function getValidThreadsToken(authorId: string): Promise<{
  accessToken: string
  userId: string
}> {
  const db = useDB()

  const account = await db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.authorId, authorId),
      eq(schema.socialAccounts.platform, 'threads'),
    ),
  })

  if (!account?.accessToken || !account?.platformUserId) {
    throw new Error('請先連結 Threads 帳號')
  }

  // 檢查 token 是否需要刷新（7天內到期）
  const needsRefresh = account.tokenExpiresAt
    && Date.now() >= account.tokenExpiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS

  if (needsRefresh) {
    console.log(`[Threads Auth] 正在刷新 Token (作者: ${authorId})...`)

    try {
      const refreshed = await refreshLongLivedToken(account.accessToken)
      const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000)

      await db
        .update(schema.socialAccounts)
        .set({
          accessToken: refreshed.accessToken,
          tokenExpiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.socialAccounts.id, account.id))

      console.log(`[Threads Auth] Token 刷新成功 (到期: ${newExpiresAt.toISOString()})`)

      return {
        accessToken: refreshed.accessToken,
        userId: account.platformUserId,
      }
    } catch (error) {
      console.error(`[Threads Auth] Token 刷新失敗:`, error)
      // 如果刷新失敗但 token 還沒過期，繼續用舊的
      if (account.tokenExpiresAt && Date.now() < account.tokenExpiresAt.getTime()) {
        return {
          accessToken: account.accessToken,
          userId: account.platformUserId,
        }
      }
      throw new Error('Threads Token 已過期且刷新失敗，請重新連結帳號')
    }
  }

  return {
    accessToken: account.accessToken,
    userId: account.platformUserId,
  }
}

/**
 * Upsert socialAccount record for Threads
 */
export async function upsertThreadsAccount(params: {
  authorId: string
  platformUserId: string
  platformUsername: string
  accessToken: string
  expiresIn: number
}) {
  const db = useDB()
  const now = new Date()
  const expiresAt = new Date(Date.now() + params.expiresIn * 1000)

  // 查找現有記錄
  const existing = await db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.authorId, params.authorId),
      eq(schema.socialAccounts.platform, 'threads'),
    ),
  })

  if (existing) {
    await db
      .update(schema.socialAccounts)
      .set({
        platformUserId: params.platformUserId,
        platformUsername: params.platformUsername,
        accessToken: params.accessToken,
        tokenExpiresAt: expiresAt,
        updatedAt: now,
      })
      .where(eq(schema.socialAccounts.id, existing.id))
  } else {
    await db.insert(schema.socialAccounts).values({
      id: nanoid(),
      authorId: params.authorId,
      platform: 'threads',
      platformUserId: params.platformUserId,
      platformUsername: params.platformUsername,
      accessToken: params.accessToken,
      tokenExpiresAt: expiresAt,
      createdAt: now,
      updatedAt: now,
    })
  }
}
