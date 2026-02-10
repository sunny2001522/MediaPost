import Replicate from 'replicate'

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

  return {
    transcript: output.transcription
  }
}

// 驗證 YouTube URL
export function isValidYouTubeUrl(url: string): boolean {
  return !!extractVideoId(url)
}
