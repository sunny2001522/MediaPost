/**
 * CMoney YouTube API 服務
 *
 * API 端點：https://streamingmedia.cmoney.tw/StreamingMediaService.Api/api/v1/VideoChannel/{channelId}/videos?amount=20&time={pubDate}
 * - 首次不帶 time 參數會返回最新影片
 * - 要往前取得更舊的影片，需將最舊的 pubDate 帶入 time 參數
 */

const CMONEY_API_BASE = 'https://streamingmedia.cmoney.tw/StreamingMediaService.Api/api/v1'

export interface CMoneyYoutubeVideo {
  youtubeVideoId: string
  pubDate: number // Unix timestamp
  title?: string
  // 其他 API 可能返回的欄位
  [key: string]: any
}

/**
 * 從 API 回應中提取影片陣列
 */
function extractVideos(data: any): CMoneyYoutubeVideo[] {
  // 如果直接是陣列
  if (Array.isArray(data)) {
    console.log(`[CMoney YouTube] Response is array with ${data.length} items`)
    return data.filter((item: any) => item && item.youtubeVideoId)
  }

  // 如果是物件
  if (typeof data === 'object' && data !== null) {
    // 檢查數字索引的屬性（0, 1, 2, ...）
    const videos: CMoneyYoutubeVideo[] = []
    const keys = Object.keys(data)

    for (const key of keys) {
      if (/^\d+$/.test(key)) {
        const item = data[key]
        if (item && typeof item === 'object' && item.youtubeVideoId && item.pubDate !== undefined) {
          videos.push(item)
        }
      }
    }

    if (videos.length > 0) {
      console.log(`[CMoney YouTube] Found ${videos.length} videos via numeric keys`)
      return videos
    }

    // 嘗試其他屬性
    for (const key of keys) {
      const value = data[key]
      if (Array.isArray(value) && value.length > 0 && value[0] && value[0].youtubeVideoId) {
        console.log(`[CMoney YouTube] Found videos in property: ${key}`)
        return value
      }
    }
  }

  console.warn('[CMoney YouTube] Could not extract videos from response. Keys:', Object.keys(data || {}))
  return []
}

/**
 * 取得單頁 YouTube 影片資料
 */
export async function fetchYoutubeVideoPage(
  channelId: string,
  options?: { time?: number; amount?: number }
): Promise<CMoneyYoutubeVideo[]> {
  const { time, amount = 20 } = options || {}

  let url = `${CMONEY_API_BASE}/VideoChannel/${channelId}/videos?amount=${amount}`
  if (time) {
    url += `&time=${time}`
  }

  console.log(`[CMoney YouTube] Fetching: ${url}`)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`CMoney YouTube API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // 提取影片陣列
  const videos = extractVideos(data)

  console.log(`[CMoney YouTube] Extracted ${videos.length} videos from response`)

  return videos
}

/**
 * 取得所有 YouTube 影片（自動分頁）
 */
export async function fetchAllYoutubeVideos(
  channelId: string,
  options?: { maxVideos?: number }
): Promise<CMoneyYoutubeVideo[]> {
  const { maxVideos = 500 } = options || {}
  const allVideos: CMoneyYoutubeVideo[] = []
  let time: number | undefined = undefined
  let pageCount = 0

  while (allVideos.length < maxVideos) {
    pageCount++
    console.log(`[CMoney YouTube] Fetching page ${pageCount} for channelId ${channelId}`)

    const page = await fetchYoutubeVideoPage(channelId, { time })

    if (!page || page.length === 0) {
      console.log(`[CMoney YouTube] No more videos found`)
      break
    }

    allVideos.push(...page)

    // 取最舊的 pubDate 作為下一頁的 time（pubDate 是 Unix timestamp）
    const oldestVideo = page[page.length - 1]
    time = oldestVideo.pubDate

    console.log(`[CMoney YouTube] Got ${page.length} videos, total: ${allVideos.length}, oldest pubDate: ${time}`)

    // 如果返回數量少於 20，表示已經是最後一頁
    if (page.length < 20) {
      console.log(`[CMoney YouTube] Last page reached (got ${page.length} < 20)`)
      break
    }

    // 防止無限迴圈
    if (pageCount > 100) {
      console.warn(`[CMoney YouTube] Reached page limit (100)`)
      break
    }
  }

  // 限制返回數量
  return allVideos.slice(0, maxVideos)
}

/**
 * 將 CMoney 影片 ID 轉換為 YouTube URL
 */
export function toYoutubeUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeVideoId}`
}
