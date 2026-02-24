/**
 * YouTube 頻道相關服務
 */

interface ChannelInfo {
  channelId: string
  title: string
  customUrl?: string
  thumbnailUrl?: string
}

interface VideoItem {
  videoId: string
  title: string
  publishedAt: string
}

/**
 * 從 YouTube API 取得頻道資訊
 */
export async function getChannelInfo(channelIdOrHandle: string): Promise<ChannelInfo | null> {
  const config = useRuntimeConfig()
  const apiKey = config.youtubeApiKey

  if (!apiKey) {
    console.warn('[YouTube] No API key configured')
    return null
  }

  // 清理輸入
  let cleanInput = channelIdOrHandle.trim()

  // 從 URL 提取 handle 或 channel ID
  const handleMatch = cleanInput.match(/youtube\.com\/@([^\/\?]+)/)
  if (handleMatch) {
    cleanInput = handleMatch[1]
  }

  const channelMatch = cleanInput.match(/youtube\.com\/channel\/(UC[^\/\?]+)/)
  if (channelMatch) {
    cleanInput = channelMatch[1]
  }

  // 移除 @ 符號
  cleanInput = cleanInput.replace(/^@/, '')

  console.log(`[YouTube] Getting channel info for: ${cleanInput}`)

  try {
    // 如果是 UC 開頭的 Channel ID
    if (cleanInput.startsWith('UC') && cleanInput.length >= 24) {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${cleanInput}&key=${apiKey}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.items && data.items.length > 0) {
        const item = data.items[0]
        return {
          channelId: item.id,
          title: item.snippet.title,
          customUrl: item.snippet.customUrl,
          thumbnailUrl: item.snippet.thumbnails?.default?.url,
        }
      }
    }

    // 嘗試用 forHandle 查詢
    console.log(`[YouTube] Trying forHandle: ${cleanInput}`)
    const handleUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${cleanInput}&key=${apiKey}`
    const handleResponse = await fetch(handleUrl)
    const handleData = await handleResponse.json()

    if (handleData.items && handleData.items.length > 0) {
      const item = handleData.items[0]
      console.log(`[YouTube] Found channel via handle: ${item.snippet.title}`)
      return {
        channelId: item.id,
        title: item.snippet.title,
        customUrl: item.snippet.customUrl,
        thumbnailUrl: item.snippet.thumbnails?.default?.url,
      }
    }

    // 如果 handle 查詢失敗，嘗試用 forUsername（舊格式）
    console.log(`[YouTube] Trying forUsername: ${cleanInput}`)
    const usernameUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forUsername=${cleanInput}&key=${apiKey}`
    const usernameResponse = await fetch(usernameUrl)
    const usernameData = await usernameResponse.json()

    if (usernameData.items && usernameData.items.length > 0) {
      const item = usernameData.items[0]
      console.log(`[YouTube] Found channel via username: ${item.snippet.title}`)
      return {
        channelId: item.id,
        title: item.snippet.title,
        customUrl: item.snippet.customUrl,
        thumbnailUrl: item.snippet.thumbnails?.default?.url,
      }
    }

    // 最後嘗試 search API
    console.log(`[YouTube] Trying search: ${cleanInput}`)
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(cleanInput)}&maxResults=1&key=${apiKey}`
    const searchResponse = await fetch(searchUrl)
    const searchData = await searchResponse.json()

    if (searchData.items && searchData.items.length > 0) {
      const item = searchData.items[0]
      console.log(`[YouTube] Found channel via search: ${item.snippet.channelTitle}`)
      return {
        channelId: item.snippet.channelId,
        title: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails?.default?.url,
      }
    }

    console.warn(`[YouTube] Channel not found: ${cleanInput}`)
    return null
  } catch (error) {
    console.error('[YouTube] Error fetching channel info:', error)
    return null
  }
}

/**
 * 取得頻道最新影片
 */
export async function getChannelVideos(
  channelId: string,
  publishedAfter?: Date,
  maxResults: number = 10
): Promise<VideoItem[]> {
  const config = useRuntimeConfig()
  const apiKey = config.youtubeApiKey

  if (!apiKey) {
    console.warn('[YouTube] No API key configured')
    return []
  }

  try {
    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=${maxResults}&key=${apiKey}`

    if (publishedAfter) {
      url += `&publishedAfter=${publishedAfter.toISOString()}`
    }

    const response = await fetch(url)
    const data = await response.json()

    if (!data.items) {
      return []
    }

    return data.items.map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
    }))
  } catch (error) {
    console.error('[YouTube] Error fetching channel videos:', error)
    return []
  }
}
