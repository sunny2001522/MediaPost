import Replicate from 'replicate'
import * as OpenCC from 'opencc-js'

// 簡轉繁轉換器 (台灣繁體 + 慣用詞)
const convertToTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' })

let replicateClient: Replicate | null = null

function getReplicate(): Replicate {
  if (!replicateClient) {
    const config = useRuntimeConfig()
    replicateClient = new Replicate({
      auth: config.replicateApiToken
    })
  }
  return replicateClient
}

// 從 YouTube URL 提取影片 ID
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

// 使用 Replicate 的 Whisper 模型處理 YouTube 影片
export async function processYouTubeVideo(youtubeUrl: string): Promise<{
  transcript: string
  duration?: number
}> {
  const replicate = getReplicate()

  // 使用 openai/whisper 模型，它可以直接處理 YouTube URL
  const output = await replicate.run(
    'openai/whisper:4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2',
    {
      input: {
        audio: youtubeUrl,
        model: 'large-v3',
        language: 'zh',
        translate: false,
        transcription: 'plain text'
      }
    }
  ) as { transcription: string }

  // 簡轉繁
  let result = convertToTraditional(output.transcription)
  // 將所有空格轉換為換行（中文內容不需要空格分隔）
  result = result.replace(/ +/g, '\n')
  // 在句號、問號、驚嘆號後添加換行
  result = result.replace(/([。？！])\s*/g, '$1\n')
  // 合併連續換行為單個換行
  result = result.replace(/\n+/g, '\n')

  return {
    transcript: result.trim()
  }
}

// 驗證 YouTube URL
export function isValidYouTubeUrl(url: string): boolean {
  return !!extractVideoId(url)
}

// ========== YouTube Data API 功能 ==========

interface YouTubeVideoInfo {
  title: string
  description: string
  channelTitle: string
  publishedAt: string
}

// 使用 YouTube Data API 抓取影片資訊
export async function getYouTubeVideoInfo(youtubeUrl: string): Promise<YouTubeVideoInfo | null> {
  const videoId = extractVideoId(youtubeUrl)
  if (!videoId) return null

  const config = useRuntimeConfig()
  const apiKey = config.youtubeApiKey

  if (!apiKey) {
    console.warn('[YouTube] No API key configured, skipping description fetch')
    return null
  }

  try {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
    const response = await fetch(apiUrl)
    const data = await response.json()

    if (!data.items || data.items.length === 0) {
      console.warn('[YouTube] Video not found:', videoId)
      return null
    }

    const snippet = data.items[0].snippet
    return {
      title: snippet.title,
      description: snippet.description,
      channelTitle: snippet.channelTitle,
      publishedAt: snippet.publishedAt
    }
  } catch (error) {
    console.error('[YouTube] Error fetching video info:', error)
    return null
  }
}

// ========== 描述清理功能 ==========

// 作者專屬的描述清理規則
const AUTHOR_DESCRIPTION_RULES: Record<string, {
  separator: RegExp // 分隔符，只取分隔符之前的內容
}> = {
  '股市隱者': {
    separator: /^--+$/m // 用 "---" 或 "--" 分隔
  }
  // 其他作者可以在這裡新增不同規則
}

// 從 YouTube 描述中提取行銷摘要
export function extractMarketingSummary(
  fullDescription: string,
  authorName?: string
): string | null {
  if (!fullDescription) return null

  // 如果沒有指定作者，返回完整描述
  if (!authorName) return fullDescription.trim()

  // 取得作者專屬規則
  const rules = AUTHOR_DESCRIPTION_RULES[authorName]
  if (!rules) return fullDescription.trim()

  // 根據作者的分隔符規則清理
  const match = fullDescription.match(rules.separator)
  if (match && match.index !== undefined) {
    const cleanDescription = fullDescription.substring(0, match.index).trim()
    // 如果清理後內容太短，返回 null
    if (cleanDescription.length < 20) return null
    return cleanDescription
  }

  // 沒有找到分隔符，返回完整描述
  return fullDescription.trim()
}
