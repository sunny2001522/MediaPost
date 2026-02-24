import { createHmac } from 'crypto'

const PUBSUB_HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe'

/**
 * 訂閱 YouTube 頻道的 PubSubHubbub 推送
 */
export async function subscribeToChannel(
  channelId: string,
  webhookSecret: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  const topic = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`
  const callback = `${baseUrl}/api/youtube/webhook`

  console.log(`[PubSub] Subscribing to channel ${channelId}`)
  console.log(`[PubSub] Topic: ${topic}`)
  console.log(`[PubSub] Callback: ${callback}`)

  try {
    const formData = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.topic': topic,
      'hub.callback': callback,
      'hub.verify': 'async',
      'hub.secret': webhookSecret,
      'hub.lease_seconds': '864000', // 10 天
    })

    const response = await fetch(PUBSUB_HUB_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[PubSub] Subscription failed: ${response.status} ${text}`)
      return { success: false, error: `HTTP ${response.status}: ${text}` }
    }

    console.log(`[PubSub] Subscription request sent for ${channelId}`)
    return { success: true }
  } catch (error: any) {
    console.error('[PubSub] Error subscribing:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 取消訂閱 YouTube 頻道
 */
export async function unsubscribeFromChannel(
  channelId: string,
  webhookSecret: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  const topic = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`
  const callback = `${baseUrl}/api/youtube/webhook`

  try {
    const formData = new URLSearchParams({
      'hub.mode': 'unsubscribe',
      'hub.topic': topic,
      'hub.callback': callback,
      'hub.verify': 'async',
      'hub.secret': webhookSecret,
    })

    const response = await fetch(PUBSUB_HUB_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: `HTTP ${response.status}: ${text}` }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 驗證 HMAC 簽名
 */
export function verifyHmacSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = 'sha1=' + createHmac('sha1', secret).update(body).digest('hex')
  return signature === expectedSignature
}

/**
 * 解析 YouTube Atom Feed XML
 */
export function parseAtomFeed(xml: string): {
  videoId: string
  channelId: string
  title: string
  publishedAt: string
} | null {
  try {
    // 使用正則表達式解析 XML（避免引入額外依賴）
    const videoIdMatch = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)
    const channelIdMatch = xml.match(/<yt:channelId>([^<]+)<\/yt:channelId>/)
    const titleMatch = xml.match(/<title>([^<]+)<\/title>/)
    const publishedMatch = xml.match(/<published>([^<]+)<\/published>/)

    if (!videoIdMatch || !channelIdMatch) {
      console.warn('[PubSub] Could not parse feed, missing videoId or channelId')
      return null
    }

    return {
      videoId: videoIdMatch[1],
      channelId: channelIdMatch[1],
      title: titleMatch ? decodeXmlEntities(titleMatch[1]) : 'Untitled',
      publishedAt: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
    }
  } catch (error) {
    console.error('[PubSub] Error parsing feed:', error)
    return null
  }
}

/**
 * 解碼 XML 實體
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * 生成隨機的 webhook secret
 */
export function generateWebhookSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let secret = ''
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return secret
}

/**
 * 從頻道 URL 提取 Channel ID
 */
export function extractChannelId(url: string): string | null {
  // 支援多種 URL 格式
  const patterns = [
    // https://www.youtube.com/channel/UC...
    /youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/,
    // https://www.youtube.com/@username
    /youtube\.com\/@([a-zA-Z0-9_-]+)/,
    // https://www.youtube.com/c/username
    /youtube\.com\/c\/([a-zA-Z0-9_-]+)/,
    // https://www.youtube.com/user/username
    /youtube\.com\/user\/([a-zA-Z0-9_-]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      // 如果已經是 UC 開頭的 Channel ID，直接返回
      if (match[1].startsWith('UC')) {
        return match[1]
      }
      // 否則返回 handle，需要另外查詢 API 取得 Channel ID
      return match[1]
    }
  }

  // 如果直接輸入 Channel ID
  if (url.startsWith('UC') && url.length === 24) {
    return url
  }

  return null
}
