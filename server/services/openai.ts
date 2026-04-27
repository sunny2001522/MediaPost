import OpenAI from 'openai'
import * as OpenCC from 'opencc-js'
import { eq, and } from 'drizzle-orm'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'
import type { AuthorPersona } from '~/server/database/schema'

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

// ========== 作者人設查詢 ==========

// 從資料庫取得作者的預設人設
export async function getAuthorPersona(authorId: string | undefined | null): Promise<AuthorPersona | null> {
  if (!authorId) return null

  const db = useDB()
  const [persona] = await db
    .select()
    .from(schema.authorPersonas)
    .where(
      and(
        eq(schema.authorPersonas.authorId, authorId),
        eq(schema.authorPersonas.isDefault, true),
        eq(schema.authorPersonas.isActive, true)
      )
    )
    .limit(1)

  return persona || null
}

// ========== 基礎 Prompt ==========

const BASE_PROMPT = `你是專業的財經 Podcast 內容轉貼文專家。

## 語言要求
- 必須使用繁體中文（台灣用語）
- 禁止使用任何簡體字
- 用詞對照：視頻→影片、軟件→軟體、信息→資訊

## 寫作風格（模仿股市隱者）
- 像跟朋友聊天一樣，口語化、真誠、有溫度
- 句子要非常短，每句 5-15 字，絕對不超過 20 字
- 幾乎每一句都要換行，用換行取代逗號
- 多用「我」「你」拉近距離
- 結尾要有溫暖的祝福語
- 不要用華麗詞藻，要樸實有力
- 不要寫得像文章，要寫得像說話

## 內容要求
- 仔細閱讀完整逐字稿，提取有價值的觀點
- 避免空泛的勵志句子或無意義的讚美
- 每個觀點都要有具體內容和例子
- 不要把口頭禪、開場白、結尾語當作知識內容
- 要有自己的思考和見解，不是單純整理逐字稿
- 用詞必須盡量採用逐字稿中講者的用詞，不要用自己的話替換
- 但如果逐字稿有明顯錯字或語音辨識錯誤，要修正為正確的字詞

## 格式要求（非常重要）
- 字數必須達到 700-800 字
- 句子必須非常短，每句 5-15 字
- 每 1-2 句就換行，頻繁換行
- 段落之間空一行即可，不需要用「-」分隔
- 不要用 emoji
- 不需要 hashtag
- 內容要深入展開，不要只是點到為止`

// 貼文格式範例（正文部分，標題和重點摘要會由系統自動插入）
const POST_EXAMPLE = `
## 貼文正文範例（請嚴格模仿這個風格、長度和斷句方式）

注意：你只需要生成正文內容，標題、日期、重點摘要都會由系統自動插入。

以下是正文的範例，請仔細觀察：
- 每句話都很短（5-15字）
- 幾乎每句都換行
- 用逗號的地方，改成換行
- 口語化，像在跟朋友聊天
- 有具體內容，不是空泛的勵志語句
- 段落之間不需要「-」分隔，直接空一行即可

---範例開始---

這一集，其實不是在談宗教，
而是在談一個很現實、也很貼近投資人的問題。

我一直在想，
為什麼我們印象中的修行者，
好像都必須過得很苦？
難道生活過得好、條件不錯，
就一定會讓一個人失去慈悲與覺知嗎？

後來我慢慢理解到，
這其實跟時代背景有很大的關係。
在那些年代，簡樸不是手段，而是結果。
當一個人的內在越豐富，
對外在的需求自然就會降低。

佛法並不是反對富有，而是反對「貪」。
不是你擁有什麼，而是你是不是被它綁住。

財富本身，其實可以成為修行的助力。
你有資源，可以幫助人；
你有餘力，可以承擔責任。
真正的困難，不是變得富有，
而是富有之後，
仍然不被恐懼、比較與執著牽著走。

所以我開始相信，
真正的大修行，不是逃離世界，
而是在世界裡保持覺知。

歷史上其實也有很多例子，
只是這樣的人，
往往不夠戲劇化，不容易被寫成傳奇。

後來我也整理了五個原則，
讓資源與心靈能夠並行。

第一個，以知足為底線、以貢獻為動力
知足，讓你不被慾望推著走；
貢獻，讓你不因知足而停滯。
這筆錢，是讓你更自由，還是讓你更焦慮？

第二個，讓覺知進入每一次金錢的選擇
花錢不是錯，但要有意識、有意義。
不是最便宜最好，
而是這件事，是不是你真正需要的，
還是只是想證明自己過得不錯。

第三個，用簡約守住內心，用美感善待生活
不必刻意清苦，也不必追求浮華。
讓生活有美感，不是為了炫耀，
而是讓身心有地方安放。

第四個，將修行融入工作，而非與工作對立
專注把一件事做好，
少比較、少焦慮，本身就是修行。
你可以問自己：
我今天的忙碌，是恐懼，還是熱愛？

第五個，你可以富有，但不需要靠擁有來定義自己
財富是工具，不是你的價值。
修行不是放棄擁有，
而是在擁有之中，仍然保持自由與溫和。

所以我更相信，
真正的財富自由，是在知足中持續實踐自己。
在市場這個深淵裡，
希望我們都能偶爾停下來，
找回清醒與內心的平靜。

這一集就先聊到這邊，我們下一集再見。

---範例結束---`

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
  authorPersona?: AuthorPersona | null
  userPreferences?: string
  postCount?: number
  excludeAngles?: AngleId[]
  youtubeDescription?: string | null
  podcastLink?: string | null
  publishDate?: Date | string | number | null
  topicGuidance?: string
}): string {
  const { title, transcript, duration, authorName, authorPersona, userPreferences, postCount = 3, excludeAngles = [], youtubeDescription, podcastLink, publishDate, topicGuidance } = options

  // 過濾出可用的視角
  const availableAngles = POST_ANGLES.filter(a => !excludeAngles.includes(a.id))
  const anglesToUse = availableAngles.slice(0, postCount)

  let prompt = BASE_PROMPT

  // 加入作者人設（從資料庫取得）
  if (authorPersona) {
    const personaParts: string[] = []

    if (authorPersona.persona) {
      personaParts.push(`請仔細閱讀以下人設描述，其中包含固定的結尾格式，請務必遵循：\n${authorPersona.persona}`)
    }
    if (authorPersona.sloganToIgnore) {
      personaParts.push(`請忽略以下開場白/slogan：${authorPersona.sloganToIgnore}`)
    }
    if (authorPersona.styleGuidelines) {
      personaParts.push(`風格指引：${authorPersona.styleGuidelines}`)
    }

    if (personaParts.length > 0) {
      prompt += `\n\n## 作者人設（${authorName || '未知作者'}）- 必須嚴格遵循\n${personaParts.join('\n\n')}`
    }
  }

  // 加入範例
  prompt += POST_EXAMPLE

  // 加入 Podcast 資訊
  prompt += `\n\n## Podcast 資訊\n標題: ${title}`
  if (duration) {
    prompt += `\n時長: ${Math.floor(duration / 60)} 分鐘`
  }
  if (podcastLink) {
    prompt += `\nPodcast 連結: ${podcastLink}`
  }
  // 加入發布日期（重要：讓 AI 使用正確的日期）
  if (publishDate) {
    let dateObj: Date
    if (publishDate instanceof Date) {
      dateObj = publishDate
    } else if (typeof publishDate === 'number') {
      // Unix timestamp（秒）
      dateObj = new Date(publishDate * 1000)
    } else {
      // ISO 字串或其他格式
      dateObj = new Date(publishDate)
    }
    const formattedDate = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`
    prompt += `\n發布日期: ${formattedDate}`
    prompt += `\n（重要：請在貼文標題區使用此日期，格式為 — ${formattedDate} —）`
  }

  // 加入逐字稿
  prompt += `\n\n## 逐字稿\n${transcript}`

  // 加入用戶偏好
  if (userPreferences) {
    prompt += `\n\n## 用戶偏好風格\n${userPreferences}`
  }

  // 加入主題方向引導
  if (topicGuidance) {
    prompt += `\n\n## 主題方向引導（重要：請優先考慮此方向）
用戶希望這次生成的貼文著重以下方向：
${topicGuidance}

請在保持原有風格的基礎上，適當融入這個方向，讓內容更聚焦。`
  }

  // 如果有原始說明，告訴 AI 不要生成重點摘要（會由程式碼直接插入）
  if (youtubeDescription) {
    prompt += `\n\n## 重要：不要生成標題和重點摘要
這集 Podcast 已有原始說明，會由系統自動插入在貼文最前面。
你只需要生成正文內容，不要生成：
- 🎧Podcast_EP 標題行
- EP編號標題行
- 日期行
- 問題引導句
- 重點摘要區塊
- 分隔線（— — — — — — —）
- 「有興趣的同學可以去聽完整版」這類導流語句
- podcast連結

直接從正文開始寫起，第一句就是內容本身。
結尾用「這一集就先聊到這邊，我們下一集再見。」即可。`
  }

  // 強調要從逐字稿提取具體內容，且保留原始用詞
  prompt += `\n\n## 極度重要：內容必須來自逐字稿，且保留原始用詞
- 你必須仔細閱讀逐字稿，提取裡面的具體觀點、例子、故事
- 不要寫空泛的勵志內容或問句
- 不要問讀者「你覺得...」「你認為...」這類問題
- 要像在分享自己的思考和見解，不是在提問
- 內容要有料，要有具體的資訊和觀點
- 用「我」的視角來寫，像是在跟朋友分享這集 Podcast 的心得
- 用詞必須盡量使用逐字稿中講者的用詞，不要自行替換或改寫
- 例如講者說「深淵」就用「深淵」，不要換成「困境」；講者說「覺知」就用「覺知」，不要換成「意識」
- 但如果逐字稿有明顯錯字或語音辨識錯誤（如同音字錯誤），要修正為正確的字詞`

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

export async function generatePost(
  transcript: string,
  title: string,
  duration?: number,
  userPreferences?: string,
  authorName?: string,
  postCount: number = 3,
  excludeAngles: AngleId[] = [],
  youtubeDescription?: string | null,
  authorId?: string | null,
  podcastLink?: string | null,
  publishDate?: Date | string | number | null,
  topicGuidance?: string
): Promise<{ content: string; tokenCount: number; generationTimeMs: number; anglesUsed: AngleId[] }> {
  const openai = getOpenAI()
  const startTime = Date.now()

  // 從資料庫取得作者人設
  const authorPersona = await getAuthorPersona(authorId)

  // Debug: 記錄人設查詢結果
  console.log('[generatePost] authorId:', authorId)
  console.log('[generatePost] authorPersona found:', authorPersona ? {
    id: authorPersona.id,
    name: authorPersona.name,
    hasPersona: !!authorPersona.persona,
    personaLength: authorPersona.persona?.length || 0,
    isDefault: authorPersona.isDefault,
    isActive: authorPersona.isActive,
  } : null)

  // 計算實際可用的視角
  const availableAngles = POST_ANGLES.filter(a => !excludeAngles.includes(a.id))
  const anglesToUse = availableAngles.slice(0, postCount)
  const anglesUsed = anglesToUse.map(a => a.id)

  const prompt = buildPrompt({
    title,
    transcript,
    duration,
    authorName,
    authorPersona,
    userPreferences,
    postCount: anglesToUse.length,
    excludeAngles,
    youtubeDescription,
    podcastLink,
    publishDate,
    topicGuidance,
  })

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 4000,  // 5 篇 800 字貼文約需 4000 tokens
  })

  let content = completion.choices[0].message.content || ''
  const tokenCount = completion.usage?.total_tokens || 0
  const generationTimeMs = Date.now() - startTime

  // 如果有原始說明，程式碼直接拼接在每篇貼文的前面（不經過 AI）
  if (youtubeDescription) {
    // 清理原始說明：只保留到重點摘要結束，移除廣告連結等
    let cleanedDescription = youtubeDescription
    // 常見的廣告分隔符號
    const adSeparators = ['\n/', '\n—', '\n--', '\n【股市隱者', '\n👉', '\nHosting provided']
    for (const sep of adSeparators) {
      const idx = cleanedDescription.indexOf(sep)
      if (idx > 0) {
        cleanedDescription = cleanedDescription.substring(0, idx).trim()
      }
    }

    // 依標點符號斷句（句號、問號後換行）
    // 但不影響重點摘要區塊（🔺開頭的行）
    cleanedDescription = cleanedDescription
      .split('\n')
      .map(line => {
        // 如果是重點摘要行（🔺開頭），保持原樣
        if (line.trim().startsWith('🔺') || line.trim().startsWith('重點摘要')) {
          return line
        }
        // 其他行依標點斷句
        return line
          .replace(/。/g, '。\n')
          .replace(/？/g, '？\n')
          .replace(/！/g, '！\n')
          .replace(/\n+/g, '\n')  // 移除多餘空行
          .trim()
      })
      .join('\n')
      .trim()

    // 格式化發布日期
    let dateStr = ''
    if (publishDate) {
      let dateObj: Date
      if (publishDate instanceof Date) {
        dateObj = publishDate
      } else if (typeof publishDate === 'number') {
        dateObj = new Date(publishDate * 1000)
      } else {
        dateObj = new Date(publishDate)
      }
      dateStr = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`
    }

    // 建立標題區塊
    const headerBlock = `🎧Podcast_${title}\n— ${dateStr} —\n\n${cleanedDescription}\n\n— — — — — — —`

    // 建立收聽連結區塊（先用 placeholder，之後可以替換成實際連結）
    const listenLink = `\n\n🎧收聽連結：`

    const posts = content.split('---POST---')
    content = posts.map(post => {
      const trimmedPost = post.trim()
      if (!trimmedPost) return ''
      // 標題 + 原始說明 + 分隔線 + AI 生成的正文 + 收聽連結
      return `${headerBlock}\n\n${trimmedPost}${listenLink}`
    }).filter(p => p).join('\n\n---POST---\n\n')
  }

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
