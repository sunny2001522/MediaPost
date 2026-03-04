/**
 * AI 股票標籤提取服務
 *
 * 使用 OpenAI 從貼文內容中自動提取台股代號和情緒判斷
 */

import OpenAI from 'openai'

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const config = useRuntimeConfig()
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
    })
  }
  return openaiClient
}

export interface ExtractedStock {
  key: string // 股票代號，如 "2330"
  name?: string // 股票名稱（可選）
  bullOrBear: 0 | 1 | 2 // 0=中立, 1=看多, 2=看空
}

const EXTRACTION_PROMPT = `你是台股分析專家。請從以下貼文內容中提取提到的台股代號，並判斷文章對該股票的看法。

## 判斷規則
- bullOrBear: 0 = 中立/純分析/教學
- bullOrBear: 1 = 看多/正面/推薦買入
- bullOrBear: 2 = 看空/負面/建議賣出

## 注意事項
- 只提取明確提到的台股代號（4-6 位數字）
- 如果只提到公司名稱沒有代號，請補上代號
- 如果文章沒有明確表態，使用 0（中立）
- 最多提取 5 個最相關的股票
- 如果文章沒有提到任何股票，回傳空陣列 []

## 回傳格式
請回傳 JSON 陣列，格式如下：
[
  { "key": "2330", "name": "台積電", "bullOrBear": 1 },
  { "key": "0050", "name": "元大台灣50", "bullOrBear": 0 }
]

只回傳 JSON，不要其他說明。如果沒有股票，回傳 []。`

/**
 * 從貼文內容提取股票標籤
 */
export async function extractStockTags(content: string): Promise<ExtractedStock[]> {
  // 如果內容太短，直接回傳空陣列
  if (!content || content.length < 50) {
    return []
  }

  const openai = getOpenAI()

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: EXTRACTION_PROMPT,
        },
        {
          role: 'user',
          content: `請分析以下貼文內容：\n\n${content}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500,
    })

    const result = completion.choices[0].message.content

    if (!result) {
      console.log('[StockExtractor] 沒有回應內容')
      return []
    }

    // 解析 JSON
    const parsed = JSON.parse(result)

    // 處理不同的回傳格式
    let stocks: ExtractedStock[]
    if (Array.isArray(parsed)) {
      stocks = parsed
    } else if (parsed.stocks && Array.isArray(parsed.stocks)) {
      stocks = parsed.stocks
    } else if (parsed.data && Array.isArray(parsed.data)) {
      stocks = parsed.data
    } else {
      console.log('[StockExtractor] 無法解析回應格式:', parsed)
      return []
    }

    // 驗證和清理資料
    const validStocks = stocks
      .filter((s) => s.key && /^\d{4,6}$/.test(s.key))
      .map((s) => ({
        key: s.key,
        name: s.name,
        bullOrBear: ([0, 1, 2].includes(s.bullOrBear) ? s.bullOrBear : 0) as 0 | 1 | 2,
      }))
      .slice(0, 5) // 最多 5 個

    if (validStocks.length > 0) {
      console.log(
        '[StockExtractor] 提取到股票標籤:',
        validStocks.map((s) => `${s.key}(${s.name || ''})`).join(', ')
      )
    }

    return validStocks
  } catch (error: any) {
    console.error('[StockExtractor] 提取失敗:', error.message)
    return []
  }
}
