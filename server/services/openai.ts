import OpenAI from 'openai'
import * as OpenCC from 'opencc-js'

// 簡轉繁轉換器 (台灣繁體 + 慣用詞)
const convertToTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' })

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

// ========== 作者專屬設定 ==========

// 作者專屬 Prompt 設定
export const AUTHOR_PROMPTS: Record<string, {
  name: string
  slogan?: string  // 要忽略的 slogan
  style?: string   // 額外的風格指引
}> = {
  '老簡講股': {
    name: '老簡講股',
    slogan: '「歡迎收看老簡講股」「先讚後看 腰纏萬貫」是開場 slogan，不是內容，請完全忽略',
    style: '專注於 Podcast 中的實質投資觀點、市場分析、個股解讀',
  },
}

// ========== 基礎 Prompt ==========

const BASE_PROMPT = `你是專業的財經 Podcast 內容轉貼文專家。

## 語言要求
- 必須使用繁體中文（台灣用語）
- 禁止使用任何簡體字
- 用詞對照：視頻→影片、軟件→軟體、信息→資訊

## 寫作風格（模仿股市隱者）
- 像跟朋友聊天一樣，口語化、真誠、有溫度
- 句子要短，每句 10-20 字左右，頻繁換行
- 用「——」破折號來強調重點或轉折
- 多用「我」「你」拉近距離
- 段落之間用單獨的「-」分隔
- 結尾要有溫暖的祝福語
- 不要用華麗詞藻，要樸實有力

## 內容要求
- 仔細閱讀完整逐字稿，提取有價值的投資觀點
- 重點摘要必須是 Podcast 中實際討論的內容
- 避免空泛的勵志句子或無意義的讚美
- 每個重點都要有具體資訊
- 不要把口頭禪、開場白、結尾語當作知識內容

## 格式要求（非常重要）
- 字數必須達到 700-800 字（這是硬性要求）
- 句子要短，頻繁換行（每 1-2 句就換行）
- 段落之間用「-」分隔，至少要有 5-6 個段落
- 只在標題區用 emoji（🎧🔺）
- 加入分隔線（— — — — — — —）
- 不需要 hashtag
- 內容要深入展開，不要只是點到為止`

// 貼文格式範例
const POST_EXAMPLE = `
## 貼文格式範例（請嚴格模仿這個風格和長度）
🎧Podcast_EP337
EP337｜輸在起跑點其實是贏
— 2025/06/26 —

沒有先天資源，人生的心態如何調整？

重點摘要：
🔺 未來人生需要的兩個能力
🔺 沒有先天資源，但你有韌性
🔺 設立目標，生活有使命才有熱忱
🔺 為什麼你值得擁有自信？
— — — — — — —

這一集，我想聊一個「心態」。
很多人會覺得自己輸在起跑點：
家裡沒資源、沒背景、沒人脈，
好像人生一開始就被判了輸。

但我越來越確定一件事——
「輸在起跑點，其實是贏」。
因為你早一點看清現實，早一點學會逆風，
反而更容易長出「活得久」的能力。
-
這個想法，是我最近去慈濟
跟一群高中、大學生聊天後的感觸。
他們多半來自弱勢家庭，
而我看到最明顯的，不是他們不努力，
是他們不太相信自己。

他們會問：
「有錢的人是不是一定比較好？」
「我們努力到底有沒有用？」
「AI那麼快，我們會不會被取代？」
-
所以我跟他們說，未來有兩個能力很重要

第一，是發現問題的能力。
會解決問題不稀奇，
真正稀缺的是你能不能看懂世界在變什麼。
多看新聞、多用不同角度理解，判斷力才會長出來。

第二，使用AI工具的能力。
AI取代的不是人，
是會用AI的人，取代不會用AI的人。
-
這一集真正的重點，其實只有一個：韌性。
人生最重要的不是順風，
是你遇到逆風時，還能不能站著。

股市也是一樣。
財富很多時候不是看誰贏最多，
而是看——誰輸得最少、誰能撐過轉折。
-
那要怎麼不悲觀？
我的答案很簡單：你要有目標。
有目標，才會有使命；
有使命，才會有熱忱。
你才會知道：
「你每天做的事，是在累積你想要的未來」。
-
最後我想跟大家說——韌性真的很重要。

只有撐得久、熬得久，底氣才會拉得長。
不要看別人短時間賺了多少、過得多好，
那可能是他累積出來的成果，
只是剛好被你看到而已。

人生與投資，最重要的兩個元素
——判斷、控制。

判斷對的方向，控制好自己的紀律。
只要你能做到這兩件事，
你就已經走在對的路上了。

希望這一集，能給你一點點底氣。
我們下一集再見。`

// 不同寫作視角定義
export const POST_ANGLES = [
  { id: 'summary', name: '重點摘要', description: '提取核心觀點，條列式呈現' },
  { id: 'story', name: '故事敘述', description: '用故事手法娓娓道來' },
  { id: 'actionable', name: '行動指南', description: '聚焦可執行的建議和步驟' },
  { id: 'insight', name: '深度洞察', description: '挖掘背後的邏輯和思維' },
  { id: 'question', name: '問答互動', description: '以問題引導讀者思考' },
] as const

export type AngleId = typeof POST_ANGLES[number]['id']

// 組合完整 Prompt
function buildPrompt(options: {
  title: string
  transcript: string
  duration?: number
  authorName?: string
  userPreferences?: string
  postCount?: number
  excludeAngles?: AngleId[]
}): string {
  const { title, transcript, duration, authorName, userPreferences, postCount = 5, excludeAngles = [] } = options

  // 取得作者專屬設定
  const authorConfig = authorName ? AUTHOR_PROMPTS[authorName] : null

  // 過濾出可用的視角
  const availableAngles = POST_ANGLES.filter(a => !excludeAngles.includes(a.id))
  const anglesToUse = availableAngles.slice(0, postCount)

  let prompt = BASE_PROMPT

  // 加入作者專屬規則
  if (authorConfig) {
    prompt += `\n\n## 作者專屬規則（${authorConfig.name}）`
    if (authorConfig.slogan) {
      prompt += `\n- ${authorConfig.slogan}`
    }
    if (authorConfig.style) {
      prompt += `\n- ${authorConfig.style}`
    }
  }

  // 加入範例
  prompt += POST_EXAMPLE

  // 加入 Podcast 資訊
  prompt += `\n\n## Podcast 資訊\n標題: ${title}`
  if (duration) {
    prompt += `\n時長: ${Math.floor(duration / 60)} 分鐘`
  }

  // 加入逐字稿
  prompt += `\n\n## 逐字稿\n${transcript}`

  // 加入用戶偏好
  if (userPreferences) {
    prompt += `\n\n## 用戶偏好風格\n${userPreferences}`
  }

  // 多篇貼文指示
  prompt += `\n\n## 生成要求
請生成 ${postCount} 篇完整的貼文，每篇 700-800 字。
每篇貼文用不同的寫作視角：
${anglesToUse.map((a, i) => `${i + 1}. 【${a.name}】${a.description}`).join('\n')}

請嚴格模仿上方範例的斷句方式、句子長度、段落結構和整體風格。
每篇貼文之間用 "---POST---" 分隔。
不要標註視角名稱，直接輸出貼文內容。`

  return prompt
}

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

  // 簡轉繁
  let result = convertToTraditional(transcription as string)
  // 將所有空格轉換為換行（中文內容不需要空格分隔）
  result = result.replace(/ +/g, '\n')
  // 在句號、問號、驚嘆號後添加換行
  result = result.replace(/([。？！])\s*/g, '$1\n')
  // 合併連續換行為單個換行
  result = result.replace(/\n+/g, '\n')

  return result.trim()
}

export async function generatePost(
  transcript: string,
  title: string,
  duration?: number,
  userPreferences?: string,
  authorName?: string,
  postCount: number = 5,
  excludeAngles: AngleId[] = []
): Promise<{ content: string; tokenCount: number; generationTimeMs: number; anglesUsed: AngleId[] }> {
  const openai = getOpenAI()
  const startTime = Date.now()

  // 計算實際可用的視角
  const availableAngles = POST_ANGLES.filter(a => !excludeAngles.includes(a.id))
  const anglesToUse = availableAngles.slice(0, postCount)
  const anglesUsed = anglesToUse.map(a => a.id)

  const prompt = buildPrompt({
    title,
    transcript,
    duration,
    authorName,
    userPreferences,
    postCount: anglesToUse.length,
    excludeAngles,
  })

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 4000,  // 5 篇 800 字貼文約需 4000 tokens
  })

  const content = completion.choices[0].message.content || ''
  const tokenCount = completion.usage?.total_tokens || 0
  const generationTimeMs = Date.now() - startTime

  return { content, tokenCount, generationTimeMs, anglesUsed }
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
