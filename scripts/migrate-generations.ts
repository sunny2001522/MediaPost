/**
 * 遷移腳本：將包含多篇貼文的 generation 拆分成獨立記錄
 * 使用方式：npx tsx scripts/migrate-generations.ts
 */

import { createClient } from '@libsql/client'
import { nanoid } from 'nanoid'
import * as dotenv from 'dotenv'

dotenv.config()

async function main() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url) {
    console.error('缺少 TURSO_DATABASE_URL 環境變數')
    process.exit(1)
  }

  console.log('連接資料庫...')
  const client = createClient({ url, authToken })

  try {
    // 查詢所有包含 ---POST--- 的 generations
    console.log('查詢需要拆分的 generations...')
    const result = await client.execute(
      "SELECT * FROM generations WHERE original_content LIKE '%---POST---%' ORDER BY batch_index"
    )

    console.log(`找到 ${result.rows.length} 個需要拆分的 generations`)
    console.log('')

    let splitCount = 0
    let newRecordCount = 0

    for (const row of result.rows) {
      const id = row.id as string
      const podcastId = row.podcast_id as string
      const originalContent = row.original_content as string
      const batchIndex = row.batch_index as number
      const angleCategory = row.angle_category as string | null
      const promptVersionId = row.prompt_version_id as string | null
      const promptSnapshot = row.prompt_snapshot as string | null
      const model = row.model as string | null
      const temperature = row.temperature as number | null
      const tokenCount = row.token_count as number | null
      const generationTimeMs = row.generation_time_ms as number | null
      const createdAt = row.created_at as number

      // 拆分貼文
      const posts = originalContent.split('---POST---').map(p => p.trim()).filter(Boolean)

      if (posts.length <= 1) {
        console.log(`✓ ${id} 只有 1 篇貼文，跳過`)
        continue
      }

      console.log(`→ ${id} 有 ${posts.length} 篇貼文，開始拆分...`)
      splitCount++

      // 更新原始記錄為第一篇貼文
      await client.execute({
        sql: 'UPDATE generations SET original_content = ? WHERE id = ?',
        args: [posts[0], id],
      })
      console.log(`  ✓ 更新原始記錄為第一篇貼文`)

      // 為其他貼文創建新記錄
      for (let i = 1; i < posts.length; i++) {
        const newId = nanoid()
        const newBatchIndex = batchIndex + i * 0.1 // 用小數來保持順序

        await client.execute({
          sql: `INSERT INTO generations (
            id, podcast_id, original_content, batch_index, angle_category,
            prompt_version_id, prompt_snapshot, model, temperature,
            token_count, generation_time_ms, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            newId,
            podcastId,
            posts[i],
            newBatchIndex,
            angleCategory,
            promptVersionId,
            promptSnapshot,
            model,
            temperature,
            tokenCount ? Math.round(tokenCount / posts.length) : null,
            generationTimeMs ? Math.round(generationTimeMs / posts.length) : null,
            createdAt,
          ],
        })
        newRecordCount++
        console.log(`  ✓ 創建新記錄 ${newId} (貼文 ${i + 1})`)
      }
    }

    // 重新排序 batch_index 為整數
    console.log('')
    console.log('重新排序 batch_index...')

    // 取得所有 podcast IDs
    const podcasts = await client.execute('SELECT DISTINCT podcast_id FROM generations')

    for (const podcast of podcasts.rows) {
      const podcastId = podcast.podcast_id as string

      // 取得該 podcast 的所有 generations，按 batch_index 排序
      const gens = await client.execute({
        sql: 'SELECT id FROM generations WHERE podcast_id = ? ORDER BY batch_index',
        args: [podcastId],
      })

      // 重新設定 batch_index 為連續整數
      for (let i = 0; i < gens.rows.length; i++) {
        await client.execute({
          sql: 'UPDATE generations SET batch_index = ? WHERE id = ?',
          args: [i, gens.rows[i].id as string],
        })
      }
    }

    console.log('')
    console.log('=== 遷移完成 ===')
    console.log(`拆分了 ${splitCount} 個 generations`)
    console.log(`創建了 ${newRecordCount} 個新記錄`)
  } catch (error) {
    console.error('錯誤:', error)
    process.exit(1)
  } finally {
    client.close()
  }
}

main()
