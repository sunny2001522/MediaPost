import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

/**
 * 批次修復已生成貼文中的錯誤日期
 * 將貼文中的日期分隔線（— YYYY/MM/DD —）替換為正確的發布日期
 */
export default defineEventHandler(async () => {
  const db = useDB()

  // 取得所有 generations 及其對應的 podcast
  const results = await db
    .select({
      generation: schema.generations,
      podcast: schema.podcasts,
    })
    .from(schema.generations)
    .leftJoin(schema.podcasts, eq(schema.generations.podcastId, schema.podcasts.id))

  let fixedCount = 0
  let skippedCount = 0
  const errors: string[] = []

  for (const { generation: gen, podcast } of results) {
    try {
      if (!podcast) {
        skippedCount++
        continue
      }

      // 取得正確的發布日期
      let publishDate: Date | null = null

      if (podcast.sourceType === 'youtube') {
        const videoRecord = await db.query.youtubeVideos.findFirst({
          where: eq(schema.youtubeVideos.podcastId, podcast.id),
        })
        publishDate = videoRecord?.publishedAt || null
      } else if (podcast.sourceType === 'cmoney') {
        const episodeRecord = await db.query.cmoneyPodcastEpisodes.findFirst({
          where: eq(schema.cmoneyPodcastEpisodes.podcastId, podcast.id),
        })
        if (episodeRecord?.pubDate) {
          // pubDate 是 Unix timestamp 字串
          publishDate = new Date(parseInt(episodeRecord.pubDate, 10) * 1000)
        }
      }

      // 如果沒有發布日期，使用 podcast.createdAt
      if (!publishDate) {
        publishDate = podcast.createdAt
      }

      if (!publishDate) {
        skippedCount++
        continue
      }

      // 格式化為 YYYY/MM/DD
      const formattedDate = `${publishDate.getFullYear()}/${String(publishDate.getMonth() + 1).padStart(2, '0')}/${String(publishDate.getDate()).padStart(2, '0')}`

      // 使用正則表達式替換日期分隔線
      // 匹配 — YYYY/MM/DD — 或 — YYYY-MM-DD — 等格式
      const datePattern = /—\s*\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\s*—/g
      const newContent = gen.originalContent.replace(datePattern, `— ${formattedDate} —`)

      // 如果內容有變化才更新
      if (newContent !== gen.originalContent) {
        await db.update(schema.generations)
          .set({ originalContent: newContent })
          .where(eq(schema.generations.id, gen.id))
        fixedCount++
      } else {
        skippedCount++
      }
    } catch (error: any) {
      errors.push(`Generation ${gen.id}: ${error.message}`)
    }
  }

  return {
    success: true,
    totalProcessed: results.length,
    fixed: fixedCount,
    skipped: skippedCount,
    errors: errors.length > 0 ? errors : undefined,
  }
})
