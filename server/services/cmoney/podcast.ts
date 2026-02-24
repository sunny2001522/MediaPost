/**
 * CMoney Podcast API 服務
 *
 * API 端點：https://streamingmedia.cmoney.tw/StreamingMediaService.Api/api/v1/Podcast/{TrackId}?amount=20&before={pubDate}
 * - 首次不帶 before 參數會返回最新的 20 集
 * - 要往前取得更舊的集數，需將最舊集的 pubDate 帶入 before 參數
 */

const CMONEY_API_BASE = 'https://streamingmedia.cmoney.tw/StreamingMediaService.Api/api/v1'

export interface CMoneyPodcastEpisode {
  id: number
  title: string
  description: string
  seconds: number
  audioUrl: string
  pubDate: number // Unix timestamp
  views: number
  playingRecord: any
  categories: any
}

// API 回應結構
interface CMoneyPodcastApiResponse {
  trackId: number
  trackName: string
  imageUrl: string
  artistName: string
  description: string
  pubDate: number
  followerCount: number
  isFollowed: boolean
  tests: any[]
  // 集數陣列（可能是頂層屬性或直接是陣列）
  [key: string]: any
}

export interface FetchPodcastResult {
  episodes: CMoneyPodcastEpisode[]
  hasMore: boolean
  oldestPubDate: string | null
}

/**
 * 從 API 回應中提取集數陣列
 * API 回應格式：物件包含數字索引的集數 + 元資料屬性
 * {
 *   0: { id, title, audioUrl, pubDate, ... },
 *   1: { id, title, audioUrl, pubDate, ... },
 *   ...
 *   tests: [],
 *   trackId: 1602637578,
 *   trackName: '股市隱者',
 *   ...
 * }
 */
function extractEpisodes(data: any): CMoneyPodcastEpisode[] {
  // 如果直接是陣列
  if (Array.isArray(data)) {
    console.log(`[CMoney Podcast] Response is array with ${data.length} items`)
    return data.filter((item: any) => item && item.audioUrl)
  }

  // 如果是物件
  if (typeof data === 'object' && data !== null) {
    // 首先檢查是否有明確的 episodes 或 items 屬性
    if (Array.isArray(data.episodes)) {
      console.log(`[CMoney Podcast] Found episodes in 'episodes' property`)
      return data.episodes
    }
    if (Array.isArray(data.items)) {
      console.log(`[CMoney Podcast] Found episodes in 'items' property`)
      return data.items
    }
    if (Array.isArray(data.data)) {
      console.log(`[CMoney Podcast] Found episodes in 'data' property`)
      return data.data
    }

    // 檢查數字索引的屬性（0, 1, 2, ...）這是 CMoney API 的格式
    const episodes: CMoneyPodcastEpisode[] = []
    const keys = Object.keys(data)

    for (const key of keys) {
      // 檢查是否為數字索引
      if (/^\d+$/.test(key)) {
        const item = data[key]
        if (item && typeof item === 'object' && item.audioUrl && item.pubDate !== undefined) {
          episodes.push(item)
        }
      }
    }

    if (episodes.length > 0) {
      console.log(`[CMoney Podcast] Found ${episodes.length} episodes via numeric keys`)
      return episodes
    }

    // 遍歷所有屬性，找出是陣列且元素有 audioUrl 的
    for (const key of keys) {
      const value = data[key]
      if (Array.isArray(value) && value.length > 0 && value[0] && value[0].audioUrl) {
        console.log(`[CMoney Podcast] Found episodes in property: ${key}`)
        return value
      }
    }

    // 最後嘗試：找出所有有 audioUrl 的物件值
    const possibleEpisodes = Object.values(data).filter(
      (v): v is CMoneyPodcastEpisode =>
        typeof v === 'object' &&
        v !== null &&
        'audioUrl' in v &&
        'pubDate' in v
    )
    if (possibleEpisodes.length > 0) {
      console.log(`[CMoney Podcast] Found ${possibleEpisodes.length} episodes as object values`)
      return possibleEpisodes
    }
  }

  console.warn('[CMoney Podcast] Could not extract episodes from response. Keys:', Object.keys(data || {}))
  console.warn('[CMoney Podcast] Response sample:', JSON.stringify(data).slice(0, 500))
  return []
}

/**
 * 取得單頁 Podcast 資料
 */
export async function fetchPodcastPage(
  trackId: string,
  options?: { before?: number; amount?: number }
): Promise<CMoneyPodcastEpisode[]> {
  const { before, amount = 20 } = options || {}

  let url = `${CMONEY_API_BASE}/Podcast/${trackId}?amount=${amount}`
  if (before) {
    url += `&before=${before}`
  }

  console.log(`[CMoney Podcast] Fetching: ${url}`)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`CMoney Podcast API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // 提取集數陣列
  const episodes = extractEpisodes(data)

  console.log(`[CMoney Podcast] Extracted ${episodes.length} episodes from response`)

  return episodes
}

/**
 * 取得所有 Podcast（自動分頁）
 */
export async function fetchAllPodcastEpisodes(
  trackId: string,
  options?: { maxEpisodes?: number }
): Promise<CMoneyPodcastEpisode[]> {
  const { maxEpisodes = 500 } = options || {}
  const allEpisodes: CMoneyPodcastEpisode[] = []
  let before: number | undefined = undefined
  let pageCount = 0

  while (allEpisodes.length < maxEpisodes) {
    pageCount++
    console.log(`[CMoney Podcast] Fetching page ${pageCount} for trackId ${trackId}`)

    const page = await fetchPodcastPage(trackId, { before })

    if (!page || page.length === 0) {
      console.log(`[CMoney Podcast] No more episodes found`)
      break
    }

    allEpisodes.push(...page)

    // 取最舊的 pubDate 作為下一頁的 before（pubDate 是 Unix timestamp 數字）
    const oldestEpisode = page[page.length - 1]
    before = oldestEpisode.pubDate

    console.log(`[CMoney Podcast] Got ${page.length} episodes, total: ${allEpisodes.length}, oldest pubDate: ${before}`)

    // 如果返回數量少於 amount，表示已經是最後一頁
    if (page.length < 20) {
      console.log(`[CMoney Podcast] Last page reached (got ${page.length} < 20)`)
      break
    }

    // 防止無限迴圈
    if (pageCount > 100) {
      console.warn(`[CMoney Podcast] Reached page limit (100)`)
      break
    }
  }

  // 限制返回數量
  return allEpisodes.slice(0, maxEpisodes)
}
