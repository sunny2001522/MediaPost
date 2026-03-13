/**
 * CMoney 同學會文章抓取服務
 *
 * 從同學會社團抓取文章，用於轉發到其他平台
 */

export interface GroupArticle {
  articleId: string
  creatorId: number
  creatorName: string
  createTime: number // Unix timestamp ms
  contentTitle: string
  contentText: string
}

export interface FetchGroupArticlesResult {
  total: number
  articles: GroupArticle[]
}

const GROUP_ARTICLES_API_URL = process.env.CMONEY_GROUP_ARTICLES_API_URL
  || 'https://outpost.cmoney.tw/forumservice/api/GroupArticle/GetList'

/**
 * 從同學會社團抓取文章
 */
export async function fetchGroupArticles(
  boardId: string,
  startAt: Date,
  endAt: Date
): Promise<FetchGroupArticlesResult> {
  // 轉換為 Asia/Taipei ISO 格式
  const formatTaipeiTime = (date: Date) => {
    const offset = '+08:00'
    const d = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    return d.toISOString().replace('Z', '').replace(/\.\d{3}/, '') + offset
  }

  const params = new URLSearchParams({
    boardId,
    startAt: formatTaipeiTime(startAt),
    endAt: formatTaipeiTime(endAt),
  })

  try {
    const response = await fetch(`${GROUP_ARTICLES_API_URL}?${params}`, {
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[GroupArticles] 抓取失敗 (${response.status}):`, text.slice(0, 200))
      return { total: 0, articles: [] }
    }

    const data = await response.json()
    const articles: GroupArticle[] = (data.articles || []).map((a: any) => ({
      articleId: String(a.articleId),
      creatorId: a.creatorId,
      creatorName: a.creatorName,
      createTime: a.createTime,
      contentTitle: a.contentTitle || '',
      contentText: a.contentText || '',
    }))

    return {
      total: articles.length,
      articles,
    }
  } catch (error: any) {
    console.error('[GroupArticles] 抓取錯誤:', error.message)
    return { total: 0, articles: [] }
  }
}

/**
 * 將同學會文章轉換為 Threads 適用的短文格式
 * Threads 限制 500 字，所以需要精簡
 */
export function formatForThreads(article: GroupArticle): string {
  const text = article.contentText.trim()

  // Threads 限制 500 字
  if (text.length <= 500) {
    return text
  }

  // 超過 500 字，取前 497 字 + ...
  return text.slice(0, 497) + '...'
}
