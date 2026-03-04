/**
 * CMoney 身份認證服務
 *
 * 使用 OAuth 2.0 Resource Owner Password Credentials 流程取得 Token
 * Token 有效期為 24 小時
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

const IDENTITY_URL = 'https://www.cmoney.tw/identity/token'

// Token 提前更新的緩衝時間（1 小時）
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000

export interface CMoneyTokenResult {
  accessToken: string
  tokenType: string
  expiresIn: number // 秒（通常 86400 = 24 小時）
  expiresAt: Date
}

export interface CMoneyTokenError {
  success: false
  error: string
  statusCode?: number
}

export type FetchTokenResult =
  | { success: true; data: CMoneyTokenResult }
  | CMoneyTokenError

/**
 * 呼叫 CMoney Identity API 取得 Token
 */
export async function fetchCMoneyToken(
  clientId: string,
  account: string,
  password: string
): Promise<FetchTokenResult> {
  const payload = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: '',
    account: account,
    password: password,
    login_method: 'email',
  })

  try {
    const response = await fetch(IDENTITY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    })

    if (response.status === 401) {
      return {
        success: false,
        error: '認證失敗，帳號或密碼錯誤',
        statusCode: 401,
      }
    }

    if (!response.ok) {
      const text = await response.text()
      return {
        success: false,
        error: `伺服器錯誤 (${response.status}): ${text.slice(0, 200)}`,
        statusCode: response.status,
      }
    }

    const data = await response.json()

    if (!data.access_token) {
      return {
        success: false,
        error: '回應中沒有 access_token',
      }
    }

    const expiresIn = data.expires_in || 86400 // 預設 24 小時
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    return {
      success: true,
      data: {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresIn,
        expiresAt,
      },
    }
  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED') {
      return {
        success: false,
        error: '連線失敗，請確認網路連線',
      }
    }
    return {
      success: false,
      error: error.message || '未知錯誤',
    }
  }
}

/**
 * 檢查 Token 是否過期（含緩衝時間）
 */
export function isTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true
  return Date.now() >= expiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS
}

/**
 * 取得作者的有效 CMoney Token
 * 如果 Token 過期會自動更新
 */
export async function getValidToken(authorId: string): Promise<string> {
  const db = useDB()

  // 取得作者資料
  const author = await db.query.authors.findFirst({
    where: eq(schema.authors.id, authorId),
  })

  if (!author) {
    throw new Error(`找不到作者: ${authorId}`)
  }

  if (!author.cmoneyClientId || !author.cmoneyAccount || !author.cmoneyPassword) {
    throw new Error('作者未設定 CMoney 認證資訊')
  }

  // 檢查現有 Token 是否有效
  if (author.cmoneyAccessToken && !isTokenExpired(author.cmoneyTokenExpiresAt)) {
    return author.cmoneyAccessToken
  }

  // Token 過期或不存在，重新取得
  console.log(`[CMoney Auth] 正在更新 Token (作者: ${author.name})...`)

  const result = await fetchCMoneyToken(
    author.cmoneyClientId,
    author.cmoneyAccount,
    author.cmoneyPassword
  )

  if (!result.success) {
    throw new Error(`取得 Token 失敗: ${result.error}`)
  }

  // 更新資料庫中的 Token
  await db
    .update(schema.authors)
    .set({
      cmoneyAccessToken: result.data.accessToken,
      cmoneyTokenExpiresAt: result.data.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.authors.id, authorId))

  console.log(`[CMoney Auth] Token 更新成功 (到期: ${result.data.expiresAt.toISOString()})`)

  return result.data.accessToken
}

/**
 * 驗證作者的 CMoney 認證是否有效
 * 用於設定認證時的驗證
 */
export async function validateCMoneyAuth(
  clientId: string,
  account: string,
  password: string
): Promise<{ valid: boolean; error?: string }> {
  const result = await fetchCMoneyToken(clientId, account, password)

  if (result.success) {
    return { valid: true }
  }

  return { valid: false, error: result.error }
}
