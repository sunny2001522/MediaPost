/**
 * CMoney 投資網誌文章抓取服務
 *
 * 直接用 HTTP POST 呼叫 authorcontentsource API
 * 正式/測試站切換同 CMONEY_BLOG_ENV
 */

// ========== 環境設定 ==========

const AUTHOR_CONTENT_ENVS = {
  production: {
    baseUrl: 'https://authorcontentsource.cmoney.tw',
    articleBaseUrl: 'https://forum.cmoney.tw/notes/article',
  },
  development: {
    baseUrl: 'https://development-authorcontentsource.cmoney.tw',
    articleBaseUrl: 'https://forumtest.cmoney.tw/notes/article',
  },
} as const

function getAuthorContentEnv() {
  const env = (process.env.CMONEY_BLOG_ENV || 'development') as keyof typeof AUTHOR_CONTENT_ENVS
  return AUTHOR_CONTENT_ENVS[env] || AUTHOR_CONTENT_ENVS.development
}

// ========== 型別定義 ==========

export interface InvestmentNote {
  articleId: string
  title: string
  tags: string[]
  createdAt: number // Unix timestamp (ms)
  content: string // HTML
}

export interface FetchInvestmentNotesResult {
  notes: InvestmentNote[]
  plainTextNotes: Array<InvestmentNote & { plainContent: string }>
}

// ========== HTML → 純文字 ==========

/**
 * 將 HTML 內容轉為純文字（去除所有 HTML tags，保留文字）
 */
export function htmlToPlainText(html: string): string {
  return html
    // 移除 <figure> 及內容
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
    // 移除 <img> tags
    .replace(/<img[^>]*>/gi, '')
    // <br> / <br/> → 換行
    .replace(/<br\s*\/?>/gi, '\n')
    // </p>, </div>, </li> → 換行
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    // 移除所有剩餘 HTML tags
    .replace(/<[^>]+>/g, '')
    // 解碼 HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // 移除多餘空白行
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ========== API 呼叫 ==========

/**
 * 從 authorcontentsource API 抓取投資網誌文章
 *
 * @param authorSlug - 投資網誌作者 slug
 * @param startAt - 開始時間 (Unix ms timestamp)
 * @param endAt - 結束時間 (Unix ms timestamp)
 * @param pricingModel - 'free' | 'paid' | 'all'
 */
export async function fetchInvestmentNotes(
  authorSlug: string,
  startAt: number,
  endAt: number,
  pricingModel: 'free' | 'paid' | 'all' = 'all'
): Promise<FetchInvestmentNotesResult> {
  const apiKey = process.env.CMONEY_AUTHOR_CONTENT_API_KEY
  if (!apiKey) {
    throw new Error('未設定 CMONEY_AUTHOR_CONTENT_API_KEY 環境變數')
  }

  const env = getAuthorContentEnv()
  const results: InvestmentNote[] = []

  // 根據 pricingModel 決定要抓哪些
  const pricingModels = pricingModel === 'all'
    ? ['free', 'paid']
    : [pricingModel]

  for (const pricing of pricingModels) {
    const url = `${env.baseUrl}/api/columnist/investment-notes`

    const body = {
      authorId: authorSlug,
      startAt,
      endAt,
      pricingModel: pricing,
    }

    console.log(`[InvestmentNotes] Fetching ${pricing} notes for ${authorSlug} (${new Date(startAt).toISOString()} ~ ${new Date(endAt).toISOString()})`)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const text = await response.text()
        console.error(`[InvestmentNotes] API error (${response.status}):`, text.slice(0, 300))
        continue
      }

      const data = await response.json()
      const notes: InvestmentNote[] = data.investmentNotes || []

      console.log(`[InvestmentNotes] Got ${notes.length} ${pricing} notes for ${authorSlug}`)
      results.push(...notes)
    } catch (error: any) {
      console.error(`[InvestmentNotes] Fetch error for ${authorSlug} (${pricing}):`, error.message)
    }
  }

  // 轉換為含純文字的結果
  const plainTextNotes = results.map(note => ({
    ...note,
    plainContent: htmlToPlainText(note.content),
  }))

  return {
    notes: results,
    plainTextNotes,
  }
}

/**
 * 取得文章連結 URL
 */
export function getArticleUrl(authorSlug: string, articleId: string): string {
  const env = getAuthorContentEnv()
  return `${env.articleBaseUrl}/${authorSlug}-${articleId}`
}
