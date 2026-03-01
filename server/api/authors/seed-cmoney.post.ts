import { eq } from 'drizzle-orm'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'

/**
 * Seed CMoney Podcast 作者資料
 * POST /api/authors/seed-cmoney
 *
 * 會建立或更新所有 CMoney Podcast 頻道的作者資料
 */

// CMoney Podcast 頻道資料
const CMONEY_PODCAST_CHANNELS = [
  { name: '小朋友學投資', channelId: '1544379769' },
  { name: '兆華與阿格力-有求必應', channelId: '1648481881' },
  { name: '財報狗', channelId: '1513810513' },
  { name: '投資癮', channelId: '1518952450' },
  { name: '就是愛玩股', channelId: '1540541794' },
  { name: 'MoneyDJ財經新聞', channelId: '1531443831' },
  { name: '聽經濟', channelId: '1571066725' },
  { name: '股怪教授 謝晨彥', channelId: '1521618576' },
  { name: '真投資', channelId: '1542764157' },
  { name: '股癌', channelId: '1500839292' },
  { name: '榮耀華爾街', channelId: '1542762801' },
  { name: '兆華與股惡仔', channelId: '1590806478' },
  { name: '股市隱者', channelId: '1602637578' },
  { name: '財經一路發-阮慕驊', channelId: '1531106786' },
  { name: '鈔錢部署-盧燕俐', channelId: '1600839316' },
  { name: '不敗教主陳重銘', channelId: '1541450581' },
]

export default defineEventHandler(async () => {
  const db = useDB()
  const now = new Date()
  const results: string[] = []

  for (const channel of CMONEY_PODCAST_CHANNELS) {
    // 先查找是否已存在
    const existing = await db
      .select()
      .from(schema.authors)
      .where(eq(schema.authors.name, channel.name))
      .limit(1)

    if (existing.length > 0) {
      // 更新現有作者的 Podcast TrackId
      await db
        .update(schema.authors)
        .set({
          cmoneyPodcastTrackId: channel.channelId,
          updatedAt: now,
        })
        .where(eq(schema.authors.name, channel.name))

      results.push(`${channel.name}: 已更新 Podcast TrackId = ${channel.channelId}`)
    } else {
      // 建立新作者
      const authorId = crypto.randomUUID()
      await db.insert(schema.authors).values({
        id: authorId,
        name: channel.name,
        cmoneyPodcastTrackId: channel.channelId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })

      // 建立預設人設
      await db.insert(schema.authorPersonas).values({
        id: crypto.randomUUID(),
        authorId,
        name: '預設',
        isDefault: true,
        isActive: true,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })

      results.push(`${channel.name}: 已建立新作者，Podcast TrackId = ${channel.channelId}`)
    }
  }

  return {
    success: true,
    message: `已處理 ${CMONEY_PODCAST_CHANNELS.length} 個 CMoney Podcast 頻道`,
    results,
  }
})
