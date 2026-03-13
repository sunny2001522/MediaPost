/**
 * CMoney 投資網誌發文服務
 *
 * 使用 Admin API + apiKey 進行發文，不再需要個別作者的 OAuth 認證
 */

// ========== 常量定義 ==========

// 正式站 / 測試站 URL（透過 CMONEY_BLOG_ENV 切換，預設 development）
const BLOG_ENVS = {
  production: {
    adminArticleUrl: 'https://connect.cmoney.tw/InvestmentNote/api/Admin/Article',
    articleBaseUrl: 'https://forum.cmoney.tw/notes/article',
  },
  development: {
    adminArticleUrl: 'https://development-connect.cmoney.tw/InvestmentNote/api/Admin/Article',
    articleBaseUrl: 'https://forumtest.cmoney.tw/notes/article',
  },
} as const

function getBlogEnv() {
  const env = (process.env.CMONEY_BLOG_ENV || 'development') as keyof typeof BLOG_ENVS
  return BLOG_ENVS[env] || BLOG_ENVS.development
}

// ========== 型別定義 ==========

export interface BlogPublishOptions {
  userId: string // Admin API userId（大數字 ID 如 "6870918203145058"）
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
 * 發文到投資網誌（使用 Admin API）
 */
export async function publishToBlog(
  options: BlogPublishOptions
): Promise<BlogPublishResult> {
  const apiKey = process.env.CMONEY_BLOG_ADMIN_API_KEY
  if (!apiKey) {
    return {
      success: false,
      error: '未設定 CMONEY_BLOG_ADMIN_API_KEY 環境變數',
    }
  }

  const blogEnv = getBlogEnv()
  const url = `${blogEnv.adminArticleUrl}?userId=${options.userId}&actionType=public`

  const headers = {
    accept: 'text/plain',
    'Content-Type': 'application/json',
    apiKey,
  }

  const payload = buildBlogArticlePayload(options)

  const envName = process.env.CMONEY_BLOG_ENV || 'development'
  console.log(`[Blog] 正在發文到投資網誌（Admin API, ${envName}）...`)
  console.log('[Blog] userId:', options.userId)
  console.log('[Blog] 作者 slug:', options.authorSlug)
  console.log('[Blog] 標題:', options.title)
  if (options.tags?.length) {
    console.log('[Blog] 文字標籤:', options.tags.join(', '))
  }
  if (options.stockTags?.length) {
    console.log('[Blog] 股票標籤:', options.stockTags.join(', '))
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (response.status === 401) {
      console.error('[Blog] apiKey 無效 (401)')
      return {
        success: false,
        error: 'Admin API Key 無效，請檢查 CMONEY_BLOG_ADMIN_API_KEY',
      }
    }

    if (response.status === 403) {
      console.error(`[Blog] 無發文權限 (403)，請確認 userId（${options.userId}）和 authorSlug（${options.authorSlug}）是否正確`)
      return {
        success: false,
        error: `無發文權限，請確認 userId（${options.userId}）和作者 slug（${options.authorSlug}）是否正確`,
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

    const articleUrl = `${blogEnv.articleBaseUrl}/${options.authorSlug}-${articleId}`

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
