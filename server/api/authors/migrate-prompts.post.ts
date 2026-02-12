import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'

// 原有的硬編碼設定（遷移用）
const LEGACY_AUTHOR_PROMPTS: Record<string, {
  name: string
  slogan?: string
  style?: string
}> = {
  '老簡講股': {
    name: '老簡講股',
    slogan: '「歡迎收看老簡講股」「先讚後看 腰纏萬貫」是開場 slogan，不是內容，請完全忽略',
    style: '專注於 Podcast 中的實質投資觀點、市場分析、個股解讀',
  },
}

export default defineEventHandler(async () => {
  const db = useDB()
  const results: Array<{ authorName: string; status: 'created' | 'skipped' | 'not_found' }> = []

  for (const [authorName, config] of Object.entries(LEGACY_AUTHOR_PROMPTS)) {
    // 找到對應的作者
    const [author] = await db
      .select()
      .from(schema.authors)
      .where(eq(schema.authors.name, authorName))
      .limit(1)

    if (!author) {
      results.push({ authorName, status: 'not_found' })
      continue
    }

    // 檢查是否已有人設
    const [existingPersona] = await db
      .select()
      .from(schema.authorPersonas)
      .where(eq(schema.authorPersonas.authorId, author.id))
      .limit(1)

    if (existingPersona) {
      results.push({ authorName, status: 'skipped' })
      continue
    }

    // 建立人設記錄
    const now = new Date()
    await db.insert(schema.authorPersonas).values({
      id: nanoid(),
      authorId: author.id,
      name: '預設',
      isDefault: true,
      isActive: true,
      persona: null,
      sloganToIgnore: config.slogan || null,
      styleGuidelines: config.style || null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })

    results.push({ authorName, status: 'created' })
  }

  return {
    success: true,
    results,
    message: `遷移完成：${results.filter(r => r.status === 'created').length} 個作者人設已建立`,
  }
})
