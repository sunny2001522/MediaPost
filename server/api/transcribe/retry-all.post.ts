import { eq, inArray } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

/**
 * 批次重試卡住的轉錄任務
 * POST /api/transcribe/retry-all?batch=5
 *
 * 每次處理指定數量的 podcast（預設 5 個），同步執行
 * 重複呼叫直到全部完成
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const batchSize = Number(query.batch) || 5

  const db = useDB()

  // 找出需要重跑的 podcast（只取 batch 數量）
  const stuckStatuses = ['pending', 'error', 'downloading']

  const stuckPodcasts = await db
    .select({ id: schema.podcasts.id, title: schema.podcasts.title, status: schema.podcasts.status })
    .from(schema.podcasts)
    .where(inArray(schema.podcasts.status, stuckStatuses))
    .limit(batchSize)

  // 統計總數
  const allStuck = await db
    .select({ id: schema.podcasts.id })
    .from(schema.podcasts)
    .where(inArray(schema.podcasts.status, stuckStatuses))

  console.log(`[Retry All] Found ${allStuck.length} stuck podcasts, processing ${stuckPodcasts.length}`)

  if (stuckPodcasts.length === 0) {
    return { success: true, message: 'No stuck podcasts found', remaining: 0, processed: 0 }
  }

  const results: Array<{ id: string; title: string; success: boolean; error?: string }> = []

  // 同步逐一處理
  for (const podcast of stuckPodcasts) {
    try {
      console.log(`[Retry All] Processing: ${podcast.id} - ${podcast.title}`)

      // 直接呼叫內部 API
      await $fetch(`/api/transcribe/${podcast.id}`, { method: 'POST' })

      results.push({ id: podcast.id, title: podcast.title, success: true })
      console.log(`[Retry All] Completed: ${podcast.id}`)
    } catch (error: any) {
      results.push({ id: podcast.id, title: podcast.title, success: false, error: error.message })
      console.error(`[Retry All] Failed: ${podcast.id} - ${error.message}`)
    }
  }

  const remaining = allStuck.length - stuckPodcasts.length
  const successCount = results.filter(r => r.success).length

  return {
    success: true,
    message: `Processed ${stuckPodcasts.length} podcasts (${successCount} succeeded)`,
    processed: stuckPodcasts.length,
    succeeded: successCount,
    failed: stuckPodcasts.length - successCount,
    remaining,
    results
  }
})
