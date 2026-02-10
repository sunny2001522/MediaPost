import { nanoid } from 'nanoid'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { editId, content, platforms } = body

  if (!content || !platforms || platforms.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: content, platforms'
    })
  }

  const db = useDB()
  const results: Array<{ platform: string; status: string; postUrl?: string; error?: string }> = []

  for (const platform of platforms) {
    try {
      if (platform === 'clipboard') {
        // 剪貼簿由前端處理，這裡只記錄
        await db.insert(schema.publishRecords).values({
          id: nanoid(),
          editId: editId || null,
          platform: 'clipboard',
          content,
          status: 'success',
          createdAt: new Date()
        })
        results.push({ platform: 'clipboard', status: 'success' })
      } else if (platform === 'threads') {
        // Threads API 整合（需要先完成 OAuth）
        const config = useRuntimeConfig()

        if (!config.threadsClientId) {
          results.push({
            platform: 'threads',
            status: 'failed',
            error: 'Threads API not configured'
          })
          continue
        }

        // TODO: 實現 Threads 發布邏輯
        // 這裡先標記為待實現
        await db.insert(schema.publishRecords).values({
          id: nanoid(),
          editId: editId || null,
          platform: 'threads',
          content,
          status: 'pending',
          createdAt: new Date()
        })
        results.push({
          platform: 'threads',
          status: 'pending',
          error: 'Threads integration pending OAuth setup'
        })
      } else if (platform === 'cmoney') {
        // CMoney 需要手動發布，記錄一下
        await db.insert(schema.publishRecords).values({
          id: nanoid(),
          editId: editId || null,
          platform: 'cmoney',
          content,
          status: 'pending',
          createdAt: new Date()
        })
        results.push({
          platform: 'cmoney',
          status: 'manual',
          error: 'Please post manually to CMoney'
        })
      }
    } catch (error: any) {
      results.push({
        platform,
        status: 'failed',
        error: error.message
      })
    }
  }

  return {
    success: true,
    results
  }
})
