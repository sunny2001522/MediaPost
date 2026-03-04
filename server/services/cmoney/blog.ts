/**
 * CMoney 投資網誌發文服務
 *
 * 基於 Python 腳本 1b_update_blog_token.py 和 3_blog_post.py 的實作
 * 使用 outpost.cmoney.tw 測試機進行認證和發文
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

// ========== 常量定義 ==========

// 測試機 Identity 端點（投資網誌專用）
const BLOG_IDENTITY_URL = 'https://outpost.cmoney.tw/identity/token'

// 測試機發文端點
const BLOG_ARTICLE_CREATE_URL = 'https://development-connect.cmoney.tw/InvestmentNote/api/Article?actionType=public'

// 測試機文章連結格式
const BLOG_ARTICLE_BASE_URL = 'https://forumtest.cmoney.tw/notes/article'

// Token 提前更新的緩衝時間（1 小時）
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000

// ========== 型別定義 ==========

export interface BlogTokenResult {
  accessToken: string
  tokenType: string
  expiresIn: number // 秒（通常 86400 = 24 小時）
  expiresAt: Date
}

export interface BlogTokenError {
  success: false
  error: string
  statusCode?: number
}

export type FetchBlogTokenResult =
  | { success: true; data: BlogTokenResult }
  | BlogTokenError

export interface BlogPublishOptions {
  accessToken: string
  authorSlug: string // 投資網誌作者 slug（如 "cmoney"）
  title: string
  content: string // HTML 內容
  tags?: string[] // 文字標籤
  stockTags?: string[] // 股票標籤，格式："名稱(代號)"，如 "台積電(2330)"
  previewImgUrl?: string // 封面圖片 URL
  seoDescription?: string
  pricingModel?: 'normal' | 'subscribe' // 一般 / 訂閱制
  privacyLevel?: 'public' | 'private' // 公開 / 私人
}

export interface BlogPublishResult {
  success: boolean
  articleId?: string
  articleUrl?: string
  error?: string
}

// ========== Token 相關函數 ==========

/**
 * 呼叫投資網誌 Identity API 取得 Token
 * 使用 outpost.cmoney.tw 測試機
 */
export async function fetchBlogToken(
  clientId: string,
  account: string,
  password: string
): Promise<FetchBlogTokenResult> {
  const payload = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: '',
    account: account,
    password: password,
    login_method: 'email',
  })

  console.log('[Blog Auth] 連線到 CMoney 投資網誌身份認證服務（測試機）...')

  try {
    const response = await fetch(BLOG_IDENTITY_URL, {
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
        error: '連線失敗，請確認網路連線（需要在內網環境）',
      }
    }
    return {
      success: false,
      error: error.message || '未知錯誤',
    }
  }
}

/**
 * 檢查投資網誌 Token 是否過期（含緩衝時間）
 */
export function isBlogTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true
  return Date.now() >= expiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS
}

/**
 * 取得作者的有效投資網誌 Token
 * 如果 Token 過期會自動更新
 */
export async function getValidBlogToken(authorId: string): Promise<string> {
  const db = useDB()

  // 取得作者資料
  const author = await db.query.authors.findFirst({
    where: eq(schema.authors.id, authorId),
  })

  if (!author) {
    throw new Error(`找不到作者: ${authorId}`)
  }

  if (!author.blogClientId || !author.blogAccount || !author.blogPassword) {
    throw new Error('作者未設定投資網誌認證資訊')
  }

  // 檢查現有 Token 是否有效
  if (author.blogAccessToken && !isBlogTokenExpired(author.blogTokenExpiresAt)) {
    return author.blogAccessToken
  }

  // Token 過期或不存在，重新取得
  console.log(`[Blog Auth] 正在更新投資網誌 Token (作者: ${author.name})...`)

  const result = await fetchBlogToken(
    author.blogClientId,
    author.blogAccount,
    author.blogPassword
  )

  if (!result.success) {
    throw new Error(`取得投資網誌 Token 失敗: ${result.error}`)
  }

  // 更新資料庫中的 Token
  await db
    .update(schema.authors)
    .set({
      blogAccessToken: result.data.accessToken,
      blogTokenExpiresAt: result.data.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.authors.id, authorId))

  console.log(`[Blog Auth] 投資網誌 Token 更新成功 (到期: ${result.data.expiresAt.toISOString()})`)

  return result.data.accessToken
}

/**
 * 驗證投資網誌認證是否有效
 */
export async function validateBlogAuth(
  clientId: string,
  account: string,
  password: string
): Promise<{ valid: boolean; error?: string }> {
  const result = await fetchBlogToken(clientId, account, password)

  if (result.success) {
    return { valid: true }
  }

  return { valid: false, error: result.error }
}

// ========== 發文相關函數 ==========

/**
 * 組合投資網誌發文 API 的請求 body
 */
function buildBlogArticlePayload(options: BlogPublishOptions): Record<string, any> {
  return {
    article: {
      authorId: options.authorSlug,
      title: String(options.title),
      content: String(options.content),
      reference: '',
      seoDescription: String(options.seoDescription || ''),
      previewImgUrl: String(options.previewImgUrl || ''),
      tags: options.tags || [],
      stockTags: options.stockTags || [],
      pricingModel: options.pricingModel || 'normal',
      privacyLevel: options.privacyLevel || 'public',
    },
  }
}

/**
 * 發文到投資網誌
 */
export async function publishToBlog(
  options: BlogPublishOptions
): Promise<BlogPublishResult> {
  const headers = {
    accept: 'text/plain',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${options.accessToken}`,
  }

  const payload = buildBlogArticlePayload(options)

  console.log('[Blog] 正在發文到投資網誌...')
  console.log('[Blog] 作者 slug:', options.authorSlug)
  console.log('[Blog] 標題:', options.title)
  if (options.tags?.length) {
    console.log('[Blog] 文字標籤:', options.tags.join(', '))
  }
  if (options.stockTags?.length) {
    console.log('[Blog] 股票標籤:', options.stockTags.join(', '))
  }

  try {
    const response = await fetch(BLOG_ARTICLE_CREATE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (response.status === 401) {
      console.error('[Blog] Token 無效或已過期 (401)')
      return {
        success: false,
        error: 'Token 無效或已過期，請重新認證',
      }
    }

    if (response.status === 403) {
      console.error(`[Blog] 無發文權限 (403)，請確認 authorSlug（目前為 '${options.authorSlug}'）是否正確`)
      return {
        success: false,
        error: `無發文權限，請確認作者 slug（${options.authorSlug}）是否正確`,
      }
    }

    if (!response.ok) {
      const text = await response.text()
      console.error(`[Blog] 發文失敗 (${response.status}):`, text.slice(0, 300))
      return {
        success: false,
        error: `發文失敗 (${response.status}): ${text.slice(0, 200)}`,
      }
    }

    const data = await response.json()
    const articleId = data.id

    if (!articleId) {
      console.error('[Blog] 回應中沒有 id:', data)
      return {
        success: false,
        error: '回應中沒有 article id',
      }
    }

    const articleUrl = `${BLOG_ARTICLE_BASE_URL}/${options.authorSlug}-${articleId}`

    console.log('[Blog] 發文成功!')
    console.log('[Blog] articleId:', articleId)
    console.log('[Blog] 文章連結:', articleUrl)

    return {
      success: true,
      articleId: String(articleId),
      articleUrl,
    }
  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED') {
      return {
        success: false,
        error: '連線失敗，請確認網路連線（需要在內網環境）',
      }
    }
    if (error.name === 'TimeoutError') {
      return {
        success: false,
        error: '連線逾時，請稍後再試',
      }
    }
    console.error('[Blog] 發文錯誤:', error)
    return {
      success: false,
      error: error.message || '未知錯誤',
    }
  }
}

/**
 * 將內容轉換為 HTML 格式
 * 投資網誌 API 需要 HTML 內容
 */
export function convertToHtml(plainText: string): string {
  // 將換行轉換為 <p> 段落
  const paragraphs = plainText.split(/\n\n+/)
  return paragraphs
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * 從內容提取股票標籤（格式："名稱(代號)"）
 * 投資網誌使用的格式與同學會不同
 */
export function formatStockTagsForBlog(
  stockTags: Array<{ key: string; name?: string }>
): string[] {
  return stockTags.map(tag => {
    if (tag.name) {
      return `${tag.name}(${tag.key})`
    }
    return `(${tag.key})`
  })
}
