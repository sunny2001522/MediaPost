/**
 * CMoney 同學會發文服務
 *
 * 呼叫 CMoney Forum API 發表文章
 *
 * 環境變數:
 * - CMONEY_FORUM_API_URL: Forum API 基底 URL (預設測試機 https://outpost.cmoney.tw/forumservice/api)
 * - CMONEY_FORUM_ARTICLE_URL: 文章連結前綴 (預設測試機)
 */

const ARTICLE_BASE_URL = process.env.CMONEY_FORUM_ARTICLE_URL
  || 'https://outpost.cmoney.tw/follow/article'

export type ForumArticleType = 'personal' | 'group_v1' | 'group_v2'

export interface StockTag {
  key: string // 股票代號，如 "2330"
  bullOrBear?: 0 | 1 | 2 // 0=中立, 1=看多, 2=看空
}

export interface ForumPublishOptions {
  accessToken: string
  title: string
  text: string
  stockTags?: StockTag[]
  imageUrls?: string[]
  articleType?: ForumArticleType // 個版 | 社團v1 | 社團v2（預設個版）
  boardId?: string // 社團v2 需要的 board ID
}

export interface ForumPublishResult {
  success: boolean
  articleId?: string
  articleUrl?: string
  error?: string
}

/**
 * 組合發文 API 的請求 body
 */
function buildArticlePayload(
  title: string,
  text: string,
  stockTags: StockTag[],
  imageUrls: string[],
  articleType: ForumArticleType = 'personal',
  boardId?: string
): Record<string, any> {
  const commodityTags = stockTags.map((tag) => ({
    type: 'Stock',
    key: tag.key,
    bullOrBear: tag.bullOrBear ?? 0,
  }))

  const multiMedia = imageUrls.map((url) => ({
    mediaType: 'image',
    url,
  }))

  const payload: Record<string, any> = {
    title: String(title),
    text: String(text),
    commodityTags,
    multiMedia,
  }

  // 社團v2 需要 boardId
  if (articleType === 'group_v2' && boardId) {
    payload.boardId = boardId
  }

  return payload
}

/**
 * 根據文章類型取得對應的 API URL
 */
function getArticleCreateUrl(articleType: ForumArticleType = 'personal'): string {
  const baseUrl = process.env.CMONEY_FORUM_API_URL
    || 'https://outpost.cmoney.tw/forumservice/api'

  switch (articleType) {
    case 'group_v1':
      return `${baseUrl}/GroupArticle/Create`
    case 'group_v2':
      return `${baseUrl}/BoardArticle/Create`
    case 'personal':
    default:
      return `${baseUrl}/Article/Create`
  }
}

/**
 * 發文到 CMoney 同學會
 */
export async function publishToForum(
  options: ForumPublishOptions
): Promise<ForumPublishResult> {
  const { accessToken, title, text, stockTags = [], imageUrls = [], articleType = 'personal', boardId } = options

  const headers = {
    accept: 'application/json',
    'cmoneyapi-trace-context': 'mediapost',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }

  const payload = buildArticlePayload(title, text, stockTags, imageUrls, articleType, boardId)
  const articleCreateUrl = getArticleCreateUrl(articleType)

  const articleTypeLabel = { personal: '個版', group_v1: '社團v1', group_v2: '社團v2' }[articleType]
  console.log(`[CMoney Forum] 正在發文 (${articleTypeLabel})...`)
  console.log('[CMoney Forum] 標題:', title)
  console.log('[CMoney Forum] 股票標籤:', stockTags.map((t) => t.key).join(', ') || '無')
  if (articleType === 'group_v2') console.log('[CMoney Forum] Board ID:', boardId)

  try {
    const response = await fetch(articleCreateUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (response.status === 401) {
      console.error('[CMoney Forum] Token 無效或已過期 (401)')
      return {
        success: false,
        error: 'Token 無效或已過期，請重新認證',
      }
    }

    if (!response.ok) {
      const text = await response.text()
      console.error(`[CMoney Forum] 發文失敗 (${response.status}):`, text.slice(0, 300))
      return {
        success: false,
        error: `發文失敗 (${response.status}): ${text.slice(0, 200)}`,
      }
    }

    const data = await response.json()
    const articleId = data.articleId

    if (!articleId) {
      console.error('[CMoney Forum] 回應中沒有 articleId:', data)
      return {
        success: false,
        error: '回應中沒有 articleId',
      }
    }

    const articleUrl = `${ARTICLE_BASE_URL}/${articleId}`

    console.log('[CMoney Forum] 發文成功!')
    console.log('[CMoney Forum] articleId:', articleId)
    console.log('[CMoney Forum] 文章連結:', articleUrl)

    return {
      success: true,
      articleId: String(articleId),
      articleUrl,
    }
  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED') {
      return {
        success: false,
        error: '連線失敗，請確認網路連線',
      }
    }
    if (error.name === 'TimeoutError') {
      return {
        success: false,
        error: '連線逾時，請稍後再試',
      }
    }
    console.error('[CMoney Forum] 發文錯誤:', error)
    return {
      success: false,
      error: error.message || '未知錯誤',
    }
  }
}
