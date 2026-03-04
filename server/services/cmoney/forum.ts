/**
 * CMoney 同學會發文服務
 *
 * 呼叫 CMoney Forum API 發表文章
 *
 * 環境變數:
 * - CMONEY_FORUM_API_URL: 發文 API (預設測試機)
 * - CMONEY_FORUM_ARTICLE_URL: 文章連結前綴 (預設測試機)
 */

const ARTICLE_CREATE_URL = process.env.CMONEY_FORUM_API_URL
  || 'https://outpost.cmoney.tw/forumservice/api/Article/Create'

const ARTICLE_BASE_URL = process.env.CMONEY_FORUM_ARTICLE_URL
  || 'https://outpost.cmoney.tw/follow/article'

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
  imageUrls: string[]
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

  return {
    title: String(title),
    text: String(text),
    commodityTags,
    multiMedia,
  }
}

/**
 * 發文到 CMoney 同學會
 */
export async function publishToForum(
  options: ForumPublishOptions
): Promise<ForumPublishResult> {
  const { accessToken, title, text, stockTags = [], imageUrls = [] } = options

  const headers = {
    accept: 'application/json',
    'cmoneyapi-trace-context': 'mediapost',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }

  const payload = buildArticlePayload(title, text, stockTags, imageUrls)

  console.log('[CMoney Forum] 正在發文...')
  console.log('[CMoney Forum] 標題:', title)
  console.log('[CMoney Forum] 股票標籤:', stockTags.map((t) => t.key).join(', ') || '無')

  try {
    const response = await fetch(ARTICLE_CREATE_URL, {
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
