import { eq } from 'drizzle-orm'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'

/**
 * 設定預設的 CMoney IDs
 * POST /api/authors/seed-cmoney
 *
 * 股市隱者的 Podcast TrackId: 1602637578
 * 權證小哥的 YouTube 頻道 ID: UC-_yPPKswADJNcIV_jEoGLA
 */
export default defineEventHandler(async () => {
  const db = useDB()
  const now = new Date()
  const results: string[] = []

  // 更新股市隱者的 Podcast TrackId
  const updatedGsyz = await db
    .update(schema.authors)
    .set({
      cmoneyPodcastTrackId: '1602637578',
      updatedAt: now,
    })
    .where(eq(schema.authors.name, '股市隱者'))
    .returning()

  if (updatedGsyz.length > 0) {
    results.push(`股市隱者: 已設定 Podcast TrackId = 1602637578`)
  } else {
    results.push(`股市隱者: 找不到此作者`)
  }

  // 更新權證小哥的 YouTube 頻道 ID
  const updatedQzxg = await db
    .update(schema.authors)
    .set({
      cmoneyYoutubeChannelId: 'UC-_yPPKswADJNcIV_jEoGLA',
      updatedAt: now,
    })
    .where(eq(schema.authors.name, '權證小哥'))
    .returning()

  if (updatedQzxg.length > 0) {
    results.push(`權證小哥: 已設定 YouTube 頻道 ID = UC-_yPPKswADJNcIV_jEoGLA`)
  } else {
    results.push(`權證小哥: 找不到此作者`)
  }

  return {
    success: true,
    results,
  }
})
