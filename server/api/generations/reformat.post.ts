import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

/**
 * 重新格式化所有現有的貼文
 * 套用新的格式：標題 + 原始說明（依標點斷句）+ 分隔線 + 正文 + 收聽連結
 */
export default defineEventHandler(async () => {
  const db = useDB()

  // 取得所有 podcast 和其 generations
  const podcasts = await db.query.podcasts.findMany({
    where: eq(schema.podcasts.status, 'completed'),
  })

  // 取得所有 generations
  const allGenerations = await db.query.generations.findMany()

  // 取得 CMoney 集數資料（用於發布日期）
  const cmoneyEpisodes = await db.query.cmoneyPodcastEpisodes.findMany()

  let updatedCount = 0
  const errors: string[] = []

  for (const podcast of podcasts) {
    // 只處理有 youtubeDescription 的 podcast
    if (!podcast.youtubeDescription) continue

    // 取得發布日期
    let publishDate: Date | null = null
    const episodeRecord = cmoneyEpisodes.find(e => e.podcastId === podcast.id)
    if (episodeRecord?.pubDate) {
      publishDate = new Date(parseInt(episodeRecord.pubDate, 10) * 1000)
    } else {
      publishDate = podcast.createdAt
    }

    // 格式化日期
    const dateStr = publishDate
      ? `${publishDate.getFullYear()}/${String(publishDate.getMonth() + 1).padStart(2, '0')}/${String(publishDate.getDate()).padStart(2, '0')}`
      : ''

    // 清理原始說明
    let cleanedDescription = podcast.youtubeDescription
    const adSeparators = ['\n/', '\n—', '\n--', '\n【股市隱者', '\n👉', '\nHosting provided']
    for (const sep of adSeparators) {
      const idx = cleanedDescription.indexOf(sep)
      if (idx > 0) {
        cleanedDescription = cleanedDescription.substring(0, idx).trim()
      }
    }

    // 依標點符號斷句
    cleanedDescription = cleanedDescription
      .split('\n')
      .map(line => {
        if (line.trim().startsWith('🔺') || line.trim().startsWith('重點摘要')) {
          return line
        }
        return line
          .replace(/。/g, '。\n')
          .replace(/？/g, '？\n')
          .replace(/！/g, '！\n')
          .replace(/\n+/g, '\n')
          .trim()
      })
      .join('\n')
      .trim()

    // 建立標題區塊
    const headerBlock = `🎧Podcast_${podcast.title}\n— ${dateStr} —\n\n${cleanedDescription}\n\n— — — — — — —`

    // 收聽連結
    const listenLink = `\n\n🎧收聽連結：`

    // 取得這個 podcast 的所有 generations
    const podcastGenerations = allGenerations.filter(g => g.podcastId === podcast.id)

    for (const generation of podcastGenerations) {
      try {
        // 檢查是否有多篇貼文（用 ---POST--- 分隔）
        const hasMultiplePosts = generation.originalContent.includes('---POST---')

        if (hasMultiplePosts) {
          // 處理多篇貼文的情況
          const posts = generation.originalContent.split(/---\s*POST\s*---/i)
          const reformattedPosts: string[] = []

          for (const post of posts) {
            const trimmedPost = post.trim()
            if (!trimmedPost) continue

            // 提取正文
            let bodyContent = trimmedPost

            // 嘗試找到正文開始的位置（在分隔線之後）
            const separatorPatterns = ['— — — — — — —', '——————', '------']
            for (const sep of separatorPatterns) {
              const sepIndex = bodyContent.indexOf(sep)
              if (sepIndex !== -1) {
                bodyContent = bodyContent.substring(sepIndex + sep.length).trim()
                break
              }
            }

            // 如果沒有找到分隔線，嘗試找正文開頭
            if (bodyContent === trimmedPost) {
              const patterns = [/^(這一集|這集|今天|投資|你有沒有|很多人|我們|記得)/m]
              for (const pattern of patterns) {
                const match = bodyContent.match(pattern)
                if (match && match.index !== undefined && match.index > 0) {
                  bodyContent = bodyContent.substring(match.index).trim()
                  break
                }
              }
            }

            // 移除結尾的舊收聽連結
            bodyContent = bodyContent
              .replace(/\n*🎧收聽連結：[\s\S]*$/, '')
              .replace(/\n*podcast連結：[\s\S]*$/, '')
              .replace(/\n*有興趣的同學[\s\S]*$/, '')
              .trim()

            // 組合新格式
            reformattedPosts.push(`${headerBlock}\n\n${bodyContent}${listenLink}`)
          }

          const newContent = reformattedPosts.join('\n\n---POST---\n\n')

          await db.update(schema.generations)
            .set({ originalContent: newContent })
            .where(eq(schema.generations.id, generation.id))

          updatedCount += reformattedPosts.length
        } else {
          // 處理單篇貼文的情況
          let bodyContent = generation.originalContent

          // 嘗試找到正文開始的位置（在分隔線之後）
          const separatorPatterns = ['— — — — — — —', '——————', '------']
          for (const sep of separatorPatterns) {
            const sepIndex = bodyContent.indexOf(sep)
            if (sepIndex !== -1) {
              bodyContent = bodyContent.substring(sepIndex + sep.length).trim()
              break
            }
          }

          // 如果沒有找到分隔線，嘗試找正文開頭
          if (bodyContent === generation.originalContent) {
            const patterns = [/^(這一集|這集|今天|投資|你有沒有|很多人|我們|記得)/m]
            for (const pattern of patterns) {
              const match = bodyContent.match(pattern)
              if (match && match.index !== undefined && match.index > 0) {
                bodyContent = bodyContent.substring(match.index).trim()
                break
              }
            }
          }

          // 移除結尾的舊收聽連結
          bodyContent = bodyContent
            .replace(/\n*🎧收聽連結：[\s\S]*$/, '')
            .replace(/\n*podcast連結：[\s\S]*$/, '')
            .replace(/\n*有興趣的同學[\s\S]*$/, '')
            .trim()

          const newContent = `${headerBlock}\n\n${bodyContent}${listenLink}`

          await db.update(schema.generations)
            .set({ originalContent: newContent })
            .where(eq(schema.generations.id, generation.id))

          updatedCount++
        }
      } catch (error: any) {
        errors.push(`Generation ${generation.id}: ${error.message}`)
      }
    }
  }

  return {
    success: true,
    updatedCount,
    errors: errors.length > 0 ? errors : undefined,
  }
})
