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
function extractVideoId(url: string): string | null {
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
