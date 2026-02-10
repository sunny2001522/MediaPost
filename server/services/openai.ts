import OpenAI from 'openai'

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const config = useRuntimeConfig()
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey
    })
  }
  return openaiClient
}

// 基礎 Prompt 模板
const BASE_PROMPT = `你是專業的 Podcast 內容轉貼文專家。請將以下 Podcast 逐字稿轉換為適合社群媒體發布的貼文。

## 要求
- 提取核心觀點和精華
- 使用吸引人的開頭
- 控制在 300-500 字
- 適當使用分段和重點標記
- 加入 3-5 個相關 hashtag

## Podcast 資訊
標題: {{title}}
{{duration}}

## 逐字稿
{{transcript}}

{{user_preferences}}

請直接生成貼文內容，不要加任何前綴說明：`

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const openai = getOpenAI()

  // 下載音檔
  const response = await fetch(audioUrl)
  const audioBuffer = await response.arrayBuffer()
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
  const audioFile = new File([audioBlob], 'audio.mp3', { type: 'audio/mpeg' })

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'zh',
    response_format: 'text'
  })

  return transcription
}

export async function generatePost(
  transcript: string,
  title: string,
  duration?: number,
  userPreferences?: string
): Promise<{ content: string; tokenCount: number; generationTimeMs: number }> {
  const openai = getOpenAI()
  const startTime = Date.now()

  let prompt = BASE_PROMPT
    .replace('{{title}}', title)
    .replace('{{duration}}', duration ? `時長: ${Math.floor(duration / 60)} 分鐘` : '')
    .replace('{{transcript}}', transcript)
    .replace('{{user_preferences}}', userPreferences ? `\n## 用戶偏好風格\n${userPreferences}` : '')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 1000
  })

  const content = completion.choices[0].message.content || ''
  const tokenCount = completion.usage?.total_tokens || 0
  const generationTimeMs = Date.now() - startTime

  return { content, tokenCount, generationTimeMs }
}

// 分析編輯意圖
export async function analyzeEdit(
  original: string,
  edited: string
): Promise<{
  patterns: Array<{
    type: string
    rule: { from?: string; to?: string; context?: string; action?: string }
    description: string
  }>
  intents: Array<{
    category: string
    description: string
    confidence: number
  }>
  suggestedPreferences: Array<{
    key: string
    value: any
    reasoning: string
  }>
}> {
  const openai = getOpenAI()

  const prompt = `你是寫作風格分析專家。分析用戶對 AI 生成文字的修改，提取偏好模式。

## 原始文字 (AI 生成)
${original}

## 修改後文字 (用戶編輯)
${edited}

請分析這些修改並回傳 JSON：
{
  "patterns": [
    {
      "type": "replacement|deletion|addition|restructure|tone_shift",
      "rule": {
        "from": "原始模式（如有）",
        "to": "替換模式（如有）",
        "context": "適用情境",
        "action": "具體動作描述"
      },
      "description": "模式描述"
    }
  ],
  "intents": [
    {
      "category": "tone|length|structure|vocabulary|style|emoji",
      "description": "修改意圖描述",
      "confidence": 0.8
    }
  ],
  "suggestedPreferences": [
    {
      "key": "preference_key",
      "value": "preference_value",
      "reasoning": "推導理由"
    }
  ]
}

只回傳 JSON，不要其他說明。`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: '你是寫作風格分析專家，擅長從文字修改中提取偏好模式。只回覆有效的 JSON。' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  })

  const result = completion.choices[0].message.content
  try {
    return JSON.parse(result || '{}')
  } catch {
    return { patterns: [], intents: [], suggestedPreferences: [] }
  }
}

// 將偏好轉換為 Prompt 指引
export async function generatePreferencePrompt(
  preferences: Array<{ key: string; value: any; confidence: number }>
): Promise<string> {
  if (preferences.length === 0) return ''

  const openai = getOpenAI()

  const prefDescriptions = preferences
    .filter(p => p.confidence >= 50)
    .map(p => `- ${p.key}: ${JSON.stringify(p.value)}`)
    .join('\n')

  const prompt = `請將以下用戶偏好整合為清晰、簡潔的寫作指引（保持條列式，不超過 150 字）：

${prefDescriptions}

只回傳指引內容，不要其他說明。`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 300
  })

  return completion.choices[0].message.content || ''
}
